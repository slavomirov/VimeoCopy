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

public class UploadService : IUploadService
{
    private readonly IAmazonS3 _s3;
    private readonly IConfiguration _config;
    private readonly AppDbContext _dbContext;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IUserService _userService;

    /// <summary>
    /// The single source of truth for what may be uploaded. The client fetches this list from
    /// /api/upload/allowed-types rather than keeping its own copy — two hand-maintained lists is
    /// how audio uploads came to transfer in full and then fail at the confirm step.
    /// </summary>
    private static readonly string[] AllowedTypes =
    [
        "image/jpeg", "image/png", "image/webp",
        "video/mp4", "video/webm", "video/quicktime", "video/mpeg",
        "audio/mpeg", "audio/ogg", "audio/wav",
    ];

    /// <summary>How long a presigned PUT stays valid. Large files on slow links need the room.</summary>
    public static readonly TimeSpan PresignLifetime = TimeSpan.FromHours(2);

    /// <summary>Maximum presigned URLs one batch call may mint.</summary>
    public const int MaxBatchSize = 20;

    public IReadOnlyCollection<string> AllowedContentTypes => AllowedTypes;

    public UploadService(
        IAmazonS3 s3,
        IConfiguration config,
        AppDbContext dbContext,
        IHttpContextAccessor httpContextAccessor,
        IUserService userService)
    {
        _s3 = s3;
        _config = config;
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
        _userService = userService;
    }

    private string CurrentUserId =>
        _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("Authentication required.");

    private static string Normalize(string? contentType) =>
        (contentType ?? string.Empty).Trim().ToLowerInvariant();

    public async Task<PresignRequestDTO> GetPresignedUrlAsync(string contentType)
        => (await GetPresignedUrlsAsync([contentType]))[0];

    public async Task<List<PresignRequestDTO>> GetPresignedUrlsAsync(IReadOnlyList<string> contentTypes)
    {
        // Refuse rather than silently clamp: quietly returning fewer URLs than asked for is what let
        // the client index past the end of the array and fail an entire 25-file batch.
        if (contentTypes is null || contentTypes.Count == 0)
            throw new ValidationException("Ask for at least one upload URL.");
        if (contentTypes.Count > MaxBatchSize)
            throw new ValidationException($"You can request at most {MaxBatchSize} upload URLs at a time.");

        // Validate the whole batch before minting anything, so a single bad file doesn't leave half
        // the batch with live keys and pending rows.
        var normalized = contentTypes.Select(Normalize).ToList();
        var rejected = normalized.FirstOrDefault(t => !AllowedTypes.Contains(t));
        if (rejected is not null)
            throw new ValidationException($"'{rejected}' files aren't supported.");

        var userId = CurrentUserId;
        var bucket = _config["AWS:BucketName"];
        var now = DateTime.UtcNow;
        var expiresAt = now.Add(PresignLifetime);

        var results = new List<PresignRequestDTO>(normalized.Count);

        foreach (var type in normalized)
        {
            var mediaId = Guid.NewGuid();

            _dbContext.PendingUploads.Add(new PendingUpload
            {
                Id = mediaId,
                UserId = userId,
                ContentType = type,
                CreatedAt = now,
                ExpiresAt = expiresAt,
            });

            results.Add(new PresignRequestDTO
            {
                Url = _s3.GetPreSignedURL(new GetPreSignedUrlRequest
                {
                    BucketName = bucket,
                    Key = mediaId.ToString(),
                    Verb = HttpVerb.PUT,
                    Expires = expiresAt,
                    ContentType = "application/octet-stream",
                }),
                MediaId = mediaId.ToString(),
                ThumbnailUploadUrl = _s3.GetPreSignedURL(new GetPreSignedUrlRequest
                {
                    BucketName = bucket,
                    Key = $"thumb_{mediaId}",
                    Verb = HttpVerb.PUT,
                    Expires = expiresAt,
                    ContentType = "image/jpeg",
                }),
            });
        }

        await _dbContext.SaveChangesAsync();
        return results;
    }

    public async Task<MediaDTO> UploadCompleteAsync(MediaUploadCompleteDTO input)
    {
        var userId = CurrentUserId;

        if (!Guid.TryParse(input.MediaId, out var mediaId))
            throw new ValidationException("That upload reference isn't valid.");

        // The pending row proves this caller is the one we minted the key for. Without it, anyone who
        // learned a pending GUID could claim someone else's uploaded object as their own media.
        var pending = await _dbContext.PendingUploads
            .FirstOrDefaultAsync(p => p.Id == mediaId && p.UserId == userId && !p.IsProfileAsset)
            ?? throw new NotFoundException("That upload has already been completed, or it expired.");

        var contentType = Normalize(input.ContentType);
        if (!AllowedTypes.Contains(contentType))
            throw new ValidationException($"'{input.ContentType}' files aren't supported.");

        // Trust the bucket, not the client: read the real object size so the quota can't be spoofed.
        long actualSize;
        try
        {
            var meta = await _s3.GetObjectMetadataAsync(_config["AWS:BucketName"], input.MediaId);
            actualSize = meta.ContentLength;
        }
        catch
        {
            throw new NotFoundException("We couldn't find that upload in storage. Please try again.");
        }

        if (actualSize <= 0)
            throw new ValidationException("That file appears to be empty.");

        var quota = await _userService.CanUserUploadAsync(userId, actualSize);
        if (quota != UserService.UploadAllowed)
            throw new QuotaExceededException(quota);

        var mediaRecord = new Media
        {
            Id = mediaId,
            FileSize = actualSize,
            ContentType = contentType,
            UploadedAt = DateTime.UtcNow,
            UserId = userId,
            IsPublic = input.IsPublic,
            FileName = input.FileName,
            ThumbnailUrl = input.HasThumbnail ? $"thumb_{input.MediaId}" : null
        };

        await _dbContext.Media.AddAsync(mediaRecord);

        // The key is accounted for now, so it is no longer pending and must not be swept.
        _dbContext.PendingUploads.Remove(pending);

        await _userService.IncreaseUsedMemoryAsync(userId, actualSize);

        if (input.ProjectId.HasValue)
            await LinkToProjectAsync(input.ProjectId.Value, userId, mediaRecord);

        await _dbContext.SaveChangesAsync();

        return new MediaDTO
        {
            Id = mediaRecord.Id,
            ContentType = mediaRecord.ContentType,
            FileSize = mediaRecord.FileSize,
            UploadedAt = mediaRecord.UploadedAt,
            Status = mediaRecord.Status,
            IsPublic = mediaRecord.IsPublic,
            HasThumbnail = !string.IsNullOrEmpty(mediaRecord.ThumbnailUrl),
            ShowOnMediaPage = mediaRecord.ShowOnMediaPage,
            Description = mediaRecord.Description,
            FileName = mediaRecord.FileName,
        };
    }

    private async Task LinkToProjectAsync(Guid projectId, string userId, Media media)
    {
        var project = await _dbContext.Projects
            .Include(p => p.ProjectMedias)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId);

        if (project == null) return;

        var maxSort = project.ProjectMedias.Count != 0
            ? project.ProjectMedias.Max(pm => pm.SortOrder)
            : -1;

        _dbContext.ProjectMedias.Add(new ProjectMedia
        {
            ProjectId = project.Id,
            MediaId = media.Id,
            SortOrder = maxSort + 1,
        });

        project.UpdatedAt = DateTime.UtcNow;

        if (!project.ThumbnailMediaId.HasValue &&
            (media.ContentType.StartsWith("image/") || media.ContentType.StartsWith("video/")))
        {
            project.ThumbnailMediaId = media.Id;
        }
    }
}
