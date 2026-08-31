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
                // Presigning here removes one HTTP round trip per tile.
                PreviewUrl = PresignKey(m.Id.ToString()),
                ThumbnailUrl = string.IsNullOrEmpty(m.ThumbnailUrl) ? null : PresignKey(m.ThumbnailUrl),
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

        await _userService.DecreaseUsedMemoryAsync(userId, media.FileSize); // bytes (matches upload accounting)
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
}
