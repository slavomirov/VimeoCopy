using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class MediaService : IMediaService
{
    private readonly AppDbContext _dbContext;
    private readonly IAmazonS3 _s3;
    private readonly IConfiguration _config;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly string? bucket;
    private readonly IUserService _userService;
    private readonly IBandwidthService _bandwidthService;

    public MediaService(AppDbContext dbContext, IAmazonS3 s3, IConfiguration config, IHttpContextAccessor httpContextAccessor, IUserService userService, IBandwidthService bandwidthService)
    {
        _dbContext = dbContext;
        _s3 = s3;
        _config = config;
        _httpContextAccessor = httpContextAccessor;
        bucket = _config["AWS:BucketName"];
        _userService = userService;
        _bandwidthService = bandwidthService;
    }

    /// <summary>Default page size for the public gallery.</summary>
    public const int DefaultPageSize = 24;
    public const int MaxPageSize = 100;

    public async Task<PagedResultDTO<PublicMediaDTO>> GetAllMediaAsync(int skip = 0, int take = DefaultPageSize)
    {
        skip = Math.Max(0, skip);
        take = Math.Clamp(take, 1, MaxPageSize);

        var query = _dbContext.Media
            .Where(m => m.IsPublic && m.ShowOnMediaPage && !m.IsProfileAsset);

        var total = await query.CountAsync();

        // Paged: the gallery used to load every public row in the database on every visit.
        var mediaList = await query
            .Include(m => m.User)
            .OrderByDescending(m => m.UploadedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync();

        // Get all project-media associations in one query
        var mediaIds = mediaList.Select(m => m.Id).ToList();
        var projectMediaMap = await _dbContext.ProjectMedias
            .Include(pm => pm.Project)
            .Where(pm => mediaIds.Contains(pm.MediaId))
            .GroupBy(pm => pm.MediaId)
            .ToDictionaryAsync(g => g.Key, g => g.First().Project);

        // Get project media counts
        var projectIds = projectMediaMap.Values.Select(p => p.Id).Distinct().ToList();
        var projectMediaCounts = await _dbContext.ProjectMedias
            .Where(pm => projectIds.Contains(pm.ProjectId))
            .GroupBy(pm => pm.ProjectId)
            .ToDictionaryAsync(g => g.Key, g => g.Count());

        // Which of these owners may offer downloads at all. Resolved in one query for the page
        // rather than per tile, so the flag the client sees already accounts for the plan.
        var ownerIds = mediaList.Select(m => m.UserId).Distinct().ToList();
        var downloadOwners = (await _dbContext.Users
                .Where(u => ownerIds.Contains(u.Id) && u.Plan != null && u.Plan.AllowDownloads)
                .Select(u => u.Id)
                .ToListAsync())
            .ToHashSet();

        var items = mediaList.Select(m =>
        {
            var dto = new PublicMediaDTO
            {
                Id = m.Id,
                FileName = m.FileName,
                ContentType = m.ContentType,
                FileSize = m.FileSize,
                UploadedAt = m.UploadedAt,
                Status = m.Status,
                IsPublic = m.IsPublic,
                Description = m.Description,
                HasThumbnail = !string.IsNullOrEmpty(m.ThumbnailUrl),
                Downloadable = m.Downloadable && downloadOwners.Contains(m.UserId),
                // Presigning here removes one HTTP round trip per tile.
                PreviewUrl = PresignKey(m.Id.ToString()),
                ThumbnailUrl = string.IsNullOrEmpty(m.ThumbnailUrl) ? null : PresignKey(m.ThumbnailUrl),
                GifUrl = string.IsNullOrEmpty(m.GifUrl) ? null : PresignKey(m.GifUrl),
                OwnerHandle = m.User?.Handle,
                OwnerDisplayName = PublicNameFor(m.User),
            };

            if (projectMediaMap.TryGetValue(m.Id, out var project))
            {
                dto.ProjectId = project.Id;
                dto.ProjectTitle = project.Title;
                dto.ProjectDescription = project.Description;
                dto.ProjectThumbnailMediaId = project.ThumbnailMediaId;
                dto.ProjectMediaCount = projectMediaCounts.GetValueOrDefault(project.Id, 0);
            }

            return dto;
        }).ToList();

        return new PagedResultDTO<PublicMediaDTO>
        {
            Items = items,
            Total = total,
            Skip = skip,
            Take = take,
        };
    }

    /// <summary>
    /// The name a stranger may see. Falls back through the public identity fields and stops at
    /// "Anonymous" — never the email address, which is what this endpoint used to expose.
    /// </summary>
    private static string PublicNameFor(ApplicationUser? user)
    {
        if (user == null) return "Anonymous";
        if (!string.IsNullOrWhiteSpace(user.DisplayName)) return user.DisplayName!;
        if (!string.IsNullOrWhiteSpace(user.Handle)) return user.Handle!;
        return "Anonymous";
    }

    public async Task<IEnumerable<Media>> GetUserMediaAsync(string userId)
        => await _dbContext.Media
            .Where(m => m.UserId == userId && !m.IsProfileAsset)
            .OrderByDescending(m => m.UploadedAt)
            .ToListAsync();

    /// <summary>
    /// Parses the id up front so lookups compare Guid to Guid. Comparing `m.Id.ToString() == id`
    /// makes SQL Server CAST the primary key on every row, which rules out the index and turns the
    /// hottest query in the app into a table scan.
    /// </summary>
    private static Guid ParseMediaId(string mediaId)
        => Guid.TryParse(mediaId, out var id)
            ? id
            : throw new NotFoundException("Media not found.");

    public async Task<Media?> GetMediaByIdAsync(string mediaId)
    {
        if (!Guid.TryParse(mediaId, out var id)) return null;
        return await _dbContext.Media.FirstOrDefaultAsync(m => m.Id == id);
    }

    /// <summary>Loads media the caller owns, or throws. Every mutation funnels through here.</summary>
    private async Task<Media> GetOwnedMediaAsync(string mediaId, string userId)
    {
        var id = ParseMediaId(mediaId);
        var media = await _dbContext.Media.FirstOrDefaultAsync(m => m.Id == id)
            ?? throw new NotFoundException("Media not found.");

        if (media.UserId != userId)
            throw new ForbiddenException("You don't have permission to change this media.");

        return media;
    }

    public async Task ToggleVisibilityAsync(string mediaId, string userId)
    {
        var media = await GetOwnedMediaAsync(mediaId, userId);

        media.IsPublic = !media.IsPublic;
        await _dbContext.SaveChangesAsync();
    }

    public async Task UpdateMediaDetailsAsync(string mediaId, string userId, UpdateMediaDetailsDTO dto)
    {
        var media = await GetOwnedMediaAsync(mediaId, userId);

        if (dto.Description is not null)
            media.Description = dto.Description;

        if (dto.ShowOnMediaPage.HasValue)
            media.ShowOnMediaPage = dto.ShowOnMediaPage.Value;

        await _dbContext.SaveChangesAsync();
    }

    /// <summary>
    /// Returns a presigned URL for actually streaming the media. This is the metered path —
    /// it charges the owner's bandwidth. Call it only when the viewer opens/plays the media.
    /// </summary>
    public async Task<GetPresignedURLDTO> GetPresignedURLAsync(string mediaId, string? source = null)
    {
        var media = await GetMediaByIdAsync(mediaId) ?? throw new NotFoundException("Media not found.");
        EnsureViewable(media);

        var allowed = await _bandwidthService.TrackPresignAsync(media, ResolveSource(media, source));
        if (!allowed)
            throw new QuotaExceededException("This media's owner has exceeded their monthly bandwidth allowance.");

        return BuildPresignedDto(media);
    }

    /// <summary>
    /// Attributes the view. The caller may declare "embed" (the iframe player does); everything else
    /// is inferred. Without this, embed playback was recorded as an ordinary public view and the
    /// Embed source never appeared in anyone's audience breakdown.
    /// </summary>
    private static BandwidthSource ResolveSource(Media media, string? declared)
    {
        if (string.Equals(declared, "embed", StringComparison.OrdinalIgnoreCase) && media.IsPublic)
            return BandwidthSource.Embed;

        return media.IsPublic ? BandwidthSource.Public : BandwidthSource.Owner;
    }

    /// <summary>
    /// Unmetered presigned URL for previews (thumbnails / video posters in galleries).
    /// Browsing a grid must NOT charge the owner the full file size, so this skips bandwidth tracking.
    /// </summary>
    public async Task<GetPresignedURLDTO> GetPreviewURLAsync(string mediaId)
    {
        var media = await GetMediaByIdAsync(mediaId) ?? throw new NotFoundException("Media not found.");
        EnsureViewable(media);
        return BuildPresignedDto(media);
    }

    /// <summary>Private media may only be presigned by its owner. Public media is open (shared links use their own flow).</summary>
    private void EnsureViewable(Media media)
    {
        if (media.IsPublic) return;
        var viewerId = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (viewerId != media.UserId)
            throw new UnauthorizedAccessException("This media is private.");
    }

    private GetPresignedURLDTO BuildPresignedDto(Media media)
        => new()
        {
            Url = PresignKey(media.Id.ToString()),
            ContentType = media.ContentType,
            ThumbnailUrl = string.IsNullOrEmpty(media.ThumbnailUrl) ? null : PresignKey(media.ThumbnailUrl),
            GifUrl = string.IsNullOrEmpty(media.GifUrl) ? null : PresignKey(media.GifUrl),
        };

    /// <summary>Read-only presigned GET for a storage key.</summary>
    private string PresignKey(string key)
        => _s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        });

    public async Task DeleteMediaAsync(string mediaId)
    {
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException("User not authenticated!");

        var media = await GetOwnedMediaAsync(mediaId, userId);

        // Storage first, database second. The row is the only record of the key, so committing the
        // delete before the object is gone strands it in the bucket with nothing pointing at it.
        // Failing here leaves everything consistent and the operation safe to retry.
        await _s3.DeleteObjectAsync(new DeleteObjectRequest
        {
            BucketName = bucket,
            Key = media.Id.ToString()
        });

        if (!string.IsNullOrEmpty(media.ThumbnailUrl))
        {
            try
            {
                await _s3.DeleteObjectAsync(new DeleteObjectRequest
                {
                    BucketName = bucket,
                    Key = media.ThumbnailUrl
                });
            }
            catch { /* the original is already gone; a stray thumbnail is swept by maintenance */ }
        }

        if (!string.IsNullOrEmpty(media.GifUrl))
        {
            try
            {
                await _s3.DeleteObjectAsync(new DeleteObjectRequest
                {
                    BucketName = bucket,
                    Key = media.GifUrl
                });
            }
            catch { /* same story as the thumbnail: the sweeper will collect it */ }
        }

        // Refund everything that was charged, not just the original. Thumbnail bytes were counted at
        // confirm time but never given back here, so deleting media left that much phantom usage on
        // the account until the nightly reconcile happened to correct it. The clip is charged the
        // same way, so it is refunded the same way.
        var reclaimed = media.FileSize + (media.ThumbnailSize ?? 0) + (media.GifSize ?? 0);
        await _userService.DecreaseUsedMemoryAsync(userId, reclaimed); // bytes (matches upload accounting)
        _dbContext.Remove(media);
        await _dbContext.SaveChangesAsync();
    }

    /// <summary>A thumbnail is a poster frame, not a second upload slot.</summary>
    public const long MaxThumbnailBytes = 2 * 1024 * 1024;

    public async Task<ThumbnailUploadResponseDTO> GetThumbnailUploadUrlAsync(string mediaId)
    {
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException("User not authenticated!");

        var media = await GetOwnedMediaAsync(mediaId, userId);

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = $"thumb_{media.Id}",
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddMinutes(15),
            ContentType = "image/jpeg"
        };

        return new ThumbnailUploadResponseDTO
        {
            UploadUrl = _s3.GetPreSignedURL(request),
            MediaId = mediaId,
        };
    }

    public async Task ConfirmThumbnailAsync(string mediaId)
    {
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException("User not authenticated!");

        var media = await GetOwnedMediaAsync(mediaId, userId);
        var thumbKey = $"thumb_{media.Id}";

        // Read the real size from the bucket. This path used to write the key without ever looking
        // at the object, so a thumbnail could be any size and never counted against the plan.
        long actualSize;
        try
        {
            var meta = await _s3.GetObjectMetadataAsync(bucket, thumbKey);
            actualSize = meta.ContentLength;
        }
        catch
        {
            throw new NotFoundException("We couldn't find that thumbnail in storage. Please try again.");
        }

        if (actualSize <= 0)
            throw new ValidationException("That thumbnail appears to be empty.");

        if (actualSize > MaxThumbnailBytes)
        {
            // Don't leave the oversized object sitting in the bucket after refusing it.
            try { await _s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = bucket, Key = thumbKey }); }
            catch { /* the sweeper will catch it */ }

            throw new ValidationException($"A thumbnail must be no larger than {MaxThumbnailBytes / (1024 * 1024)} MB.");
        }

        // Charge only the delta — re-cropping a thumbnail replaces the object at the same key, so
        // billing the full size again on every change would inflate the user's usage without limit.
        var previousSize = media.ThumbnailSize ?? 0;
        var delta = actualSize - previousSize;

        if (delta > 0)
        {
            var quota = await _userService.CanUserUploadAsync(userId, delta);
            if (quota != UserService.UploadAllowed)
                throw new QuotaExceededException(quota);

            await _userService.IncreaseUsedMemoryAsync(userId, delta);
        }
        else if (delta < 0)
        {
            await _userService.DecreaseUsedMemoryAsync(userId, -delta);
        }

        media.ThumbnailUrl = thumbKey;
        media.ThumbnailSize = actualSize;
        await _dbContext.SaveChangesAsync();
    }

    /* ── Downloads ─────────────────────────────────────────────────────────────────────────────
       Two independent switches have to be on: the file is flagged Downloadable by its owner, and
       the owner's plan allows downloads at all. Checking only the file would let a lapsed plan keep
       serving originals; checking only the plan would hand over every file the moment someone
       upgraded. Neither is what the owner agreed to.
       ──────────────────────────────────────────────────────────────────────────────────────── */

    /// <summary>
    /// Owner-only: turn downloads on or off for one file. Refused when the owner's plan doesn't
    /// include downloads, so the flag can never be set to something the UI would then contradict.
    /// </summary>
    public async Task SetDownloadableAsync(string mediaId, string userId, bool downloadable)
    {
        var media = await GetOwnedMediaAsync(mediaId, userId);

        if (downloadable && !await PlanAllowsDownloadsAsync(userId))
            throw new ForbiddenException("Your plan doesn't include file downloads. Upgrade to offer downloads.");

        media.Downloadable = downloadable;
        await _dbContext.SaveChangesAsync();
    }

    /// <summary>Whether this user's current plan includes downloads.</summary>
    public async Task<bool> PlanAllowsDownloadsAsync(string userId)
        => await _dbContext.Users
            .Where(u => u.Id == userId)
            .Select(u => u.Plan != null && u.Plan.AllowDownloads)
            .FirstOrDefaultAsync();

    /// <summary>
    /// A presigned URL that saves the file instead of streaming it, via a response-content-
    /// disposition override so storage sets the attachment header on our behalf.
    ///
    /// This is metered. A download is the largest single piece of egress the platform can serve —
    /// the entire file, at full quality — so it is charged to the owner exactly like playback. Not
    /// charging for it would leave the cheapest way to move bytes off the platform invisible in
    /// every bandwidth figure we show.
    /// </summary>
    public async Task<GetPresignedURLDTO> GetDownloadUrlAsync(string mediaId)
    {
        var media = await GetMediaByIdAsync(mediaId) ?? throw new NotFoundException("Media not found.");
        EnsureViewable(media);

        if (!media.Downloadable)
            throw new ForbiddenException("This file isn't available for download.");

        if (!await PlanAllowsDownloadsAsync(media.UserId))
            throw new ForbiddenException("This file isn't available for download.");

        var allowed = await _bandwidthService.TrackPresignAsync(media, ResolveSource(media, null));
        if (!allowed)
            throw new QuotaExceededException("This media's owner has exceeded their monthly bandwidth allowance.");

        // Fall back to the media id when there is no stored name, and strip anything that could
        // break out of the quoted filename in the Content-Disposition header.
        var fileName = SafeDownloadName(media);

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = media.Id.ToString(),
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15),
        };
        request.ResponseHeaderOverrides.ContentDisposition = $"attachment; filename=\"{fileName}\"";
        request.ResponseHeaderOverrides.ContentType = media.ContentType;

        return new GetPresignedURLDTO
        {
            Url = _s3.GetPreSignedURL(request),
            ContentType = media.ContentType,
        };
    }

    /// <summary>
    /// A file name safe to place inside a quoted header value. Quotes, backslashes, control
    /// characters and path separators are what turn a stored name into a header-injection or a
    /// path-traversal filename on the way out.
    /// </summary>
    private static string SafeDownloadName(Media media)
    {
        var raw = string.IsNullOrWhiteSpace(media.FileName) ? media.Id.ToString() : media.FileName!;

        // Quote (34), backslash (92) and forward slash (47), by code point: these are what would let
        // a stored name break out of the quoted Content-Disposition value or smuggle a path back in.
        // Written numerically because an escaped backslash in a string literal is exactly the kind of
        // thing that does not survive being edited by a tool.
        var forbidden = new[] { (char)34, (char)92, (char)47 };

        var cleaned = new string(raw
            .Where(c => !char.IsControl(c) && !forbidden.Contains(c))
            .ToArray())
            .Trim();

        return cleaned.Length == 0 ? media.Id.ToString() : cleaned[..Math.Min(cleaned.Length, 200)];
    }

    /* ── GIF generator ─────────────────────────────────────────────────────────────────────────
    /* ── GIF generator ─────────────────────────────────────────────────────────────────────────
       A "GIF" here is a short muted video clip, not an image/gif — the same thing YouTube hovers.
       An actual GIF of a 3-second 320px clip runs several megabytes and looks worse than the WebM
       that costs a couple of hundred kilobytes, so the name describes the feature and the format
       stays a video. The clip is generated in the browser from the file the user already has
       locally, then uploaded through the same presign → PUT → confirm handshake as thumbnails.
       ──────────────────────────────────────────────────────────────────────────────────────── */

    /// <summary>
    /// Ceiling for a stored clip. Generation targets a small fraction of this; the cap is here so a
    /// crafted PUT can't park an arbitrary file under a media id that browsing serves unmetered.
    /// </summary>
    public const long MaxGifBytes = 3 * 1024 * 1024;

    /// <summary>
    /// Containers a clip may be stored in. MediaRecorder emits WebM on Chrome and Firefox and MP4 on
    /// Safari, and nothing else is accepted — the object is served straight to a &lt;video&gt; tag, so
    /// letting the client name its own content type is how you end up serving HTML from your bucket.
    /// </summary>
    private static readonly string[] AllowedGifContentTypes =
    [
        "video/webm", "video/mp4",
    ];

    private static string GifKeyFor(Guid mediaId) => $"gif_{mediaId}";

    private static string NormalizeGifContentType(string? contentType)
    {
        // MediaRecorder reports codec parameters ("video/webm;codecs=vp9"), which are meaningful to
        // the recorder but not to storage. Keep the container, drop the rest.
        var raw = (contentType ?? string.Empty).Split(';')[0].Trim().ToLowerInvariant();

        if (!AllowedGifContentTypes.Contains(raw))
            throw new ValidationException("A preview clip must be WebM or MP4.");

        return raw;
    }

    /// <summary>
    /// Mints a presigned PUT for a hover-preview clip. Owner-only, and only for video: a clip of an
    /// image or an audio file has nothing to show and would just be billed storage.
    /// </summary>
    public async Task<GifUploadResponseDTO> GetGifUploadUrlAsync(string mediaId, string contentType)
    {
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException("User not authenticated!");

        var media = await GetOwnedMediaAsync(mediaId, userId);

        if (!media.ContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("Only video can have a hover preview clip.");

        var resolved = NormalizeGifContentType(contentType);

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = GifKeyFor(media.Id),
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddMinutes(15),
            ContentType = resolved,
        };

        return new GifUploadResponseDTO
        {
            UploadUrl = _s3.GetPreSignedURL(request),
            MediaId = mediaId,
            ContentType = resolved,
        };
    }

    /// <summary>
    /// Verifies the clip actually landed in storage, charges its real size to the owner's quota, and
    /// records the key. Size comes from the bucket, never the client — the same reason the thumbnail
    /// path reads object metadata instead of trusting a number in the request body.
    /// </summary>
    public async Task<GifConfirmResponseDTO> ConfirmGifAsync(string mediaId, string contentType)
    {
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException("User not authenticated!");

        var media = await GetOwnedMediaAsync(mediaId, userId);
        var resolved = NormalizeGifContentType(contentType);
        var gifKey = GifKeyFor(media.Id);

        long actualSize;
        try
        {
            var meta = await _s3.GetObjectMetadataAsync(bucket, gifKey);
            actualSize = meta.ContentLength;
        }
        catch
        {
            throw new NotFoundException("We couldn't find that preview clip in storage. Please try again.");
        }

        if (actualSize <= 0)
            throw new ValidationException("That preview clip appears to be empty.");

        if (actualSize > MaxGifBytes)
        {
            try { await _s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = bucket, Key = gifKey }); }
            catch { /* the sweeper will catch it */ }

            throw new ValidationException($"A preview clip must be no larger than {MaxGifBytes / (1024 * 1024)} MB.");
        }

        // Charge the delta. Regenerating overwrites the same key, so billing the full size each time
        // would inflate usage without bound — the mistake the thumbnail path already learned.
        var previousSize = media.GifSize ?? 0;
        var delta = actualSize - previousSize;

        if (delta > 0)
        {
            var quota = await _userService.CanUserUploadAsync(userId, delta);
            if (quota != UserService.UploadAllowed)
                throw new QuotaExceededException(quota);

            await _userService.IncreaseUsedMemoryAsync(userId, delta);
        }
        else if (delta < 0)
        {
            await _userService.DecreaseUsedMemoryAsync(userId, -delta);
        }

        media.GifUrl = gifKey;
        media.GifSize = actualSize;
        media.GifContentType = resolved;
        await _dbContext.SaveChangesAsync();

        return new GifConfirmResponseDTO
        {
            GifUrl = PresignKey(gifKey),
            Size = actualSize,
        };
    }

    /// <summary>
    /// Drops a clip and refunds its bytes. Hover falls back to the full file afterwards, so removing
    /// one costs the owner nothing but the bandwidth the clip was saving.
    /// </summary>
    public async Task DeleteGifAsync(string mediaId)
    {
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException("User not authenticated!");

        var media = await GetOwnedMediaAsync(mediaId, userId);
        if (string.IsNullOrEmpty(media.GifUrl)) return; // already gone; nothing to refund

        // Storage first, then the row — the row is the only pointer to the key, so clearing it before
        // the object is gone strands the object. Same ordering as DeleteMediaAsync.
        try
        {
            await _s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = bucket, Key = media.GifUrl });
        }
        catch { /* leave the row intact so the caller can retry */ throw; }

        if (media.GifSize.HasValue)
            await _userService.DecreaseUsedMemoryAsync(userId, media.GifSize.Value);

        media.GifUrl = null;
        media.GifSize = null;
        media.GifContentType = null;
        await _dbContext.SaveChangesAsync();
    }
}
