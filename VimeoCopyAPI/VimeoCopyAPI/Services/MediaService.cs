using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using System.Net.Sockets;
using System.Security.Claims;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
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

    public async Task<IEnumerable<PublicMediaDTO>> GetAllMediaAsync()
    {
        // Get all public media that owners want shown on the media page
        var mediaList = await _dbContext.Media
            .Include(m => m.User)
            .Where(m => m.IsPublic && m.ShowOnMediaPage && !m.IsProfileAsset)
            .OrderByDescending(m => m.UploadedAt)
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

        return mediaList.Select(m =>
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
                OwnerEmail = m.User?.Email ?? "Unknown",
                OwnerUsername = m.User?.UserName,
                OwnerHandle = m.User?.Handle,
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
        });
    }

    public async Task<IEnumerable<Media>> GetUserMediaAsync(string userId)
        => await _dbContext.Media
            .Where(m => m.UserId == userId && !m.IsProfileAsset)
            .OrderByDescending(m => m.UploadedAt)
            .ToListAsync();

    public async Task<Media?> GetMediaByIdAsync(string mediaId) => await _dbContext.Media.FirstOrDefaultAsync(x => x.Id.ToString() == mediaId);

    public async Task ToggleVisibilityAsync(string mediaId, string userId)
    {
        var media = await _dbContext.Media.FirstOrDefaultAsync(m => m.Id.ToString() == mediaId)
            ?? throw new Exception("Media not found!");

        if (media.UserId != userId)
            throw new UnauthorizedAccessException("You don't have permission to change visibility of this media.");

        media.IsPublic = !media.IsPublic;
        await _dbContext.SaveChangesAsync();
    }

    public async Task UpdateMediaDetailsAsync(string mediaId, string userId, UpdateMediaDetailsDTO dto)
    {
        var media = await _dbContext.Media.FirstOrDefaultAsync(m => m.Id.ToString() == mediaId)
            ?? throw new Exception("Media not found!");

        if (media.UserId != userId)
            throw new UnauthorizedAccessException("You don't have permission to update this media.");

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
    public async Task<GetPresignedURLDTO> GetPresignedURLAsync(string mediaId)
    {
        var media = await GetMediaByIdAsync(mediaId) ?? throw new Exception("Media with this id not found!");
        EnsureViewable(media);

        var source = media.IsPublic ? VimeoCopyAPI.Models.BandwidthSource.Public : VimeoCopyAPI.Models.BandwidthSource.Owner;
        var allowed = await _bandwidthService.TrackPresignAsync(media, source);
        if (!allowed)
            throw new Exception("This media's owner has exceeded their monthly bandwidth allowance.");

        return BuildPresignedDto(media);
    }

    /// <summary>
    /// Unmetered presigned URL for previews (thumbnails / video posters in galleries).
    /// Browsing a grid must NOT charge the owner the full file size, so this skips bandwidth tracking.
    /// </summary>
    public async Task<GetPresignedURLDTO> GetPreviewURLAsync(string mediaId)
    {
        var media = await GetMediaByIdAsync(mediaId) ?? throw new Exception("Media with this id not found!");
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
    {
        var url = _s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = media.Id.ToString(),
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        });

        string? thumbnailUrl = null;
        if (!string.IsNullOrEmpty(media.ThumbnailUrl))
        {
            thumbnailUrl = _s3.GetPreSignedURL(new GetPreSignedUrlRequest
            {
                BucketName = bucket,
                Key = media.ThumbnailUrl,
                Verb = HttpVerb.GET,
                Expires = DateTime.UtcNow.AddMinutes(15)
            });
        }

        return new() { Url = url, ContentType = media.ContentType, ThumbnailUrl = thumbnailUrl };
    }

    public async Task DeleteMediaAsync(string mediaId)
    {
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
            ?? throw new UnauthorizedAccessException("User not authenticated!");

        var media = await _dbContext.Media
            .FirstOrDefaultAsync(m => m.Id.ToString() == mediaId)
            ?? throw new Exception("Media not found!");

        if (media.UserId.ToString() != userId)
            throw new UnauthorizedAccessException("You don't have permission to delete this media.");

        await _userService.DecreaseUsedMemoryAsync(userId, media.FileSize); // bytes (matches upload accounting)
        _dbContext.Remove(media);
        await _dbContext.SaveChangesAsync();
     
        // Delete original file from S3
        await _s3.DeleteObjectAsync(new DeleteObjectRequest
        {
            BucketName = bucket,
            Key = mediaId
        });

        // Delete thumbnail from S3 if exists
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
            catch { /* thumbnail delete is best-effort */ }
        }
    }

    public async Task<ThumbnailUploadResponseDTO> GetThumbnailUploadUrlAsync(string mediaId)
    {
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException("User not authenticated!");

        var media = await _dbContext.Media.FirstOrDefaultAsync(m => m.Id.ToString() == mediaId)
            ?? throw new Exception("Media not found!");

        if (media.UserId != userId)
            throw new UnauthorizedAccessException("You don't have permission to change this media's thumbnail.");

        var thumbKey = $"thumb_{mediaId}";

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = thumbKey,
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

        var media = await _dbContext.Media.FirstOrDefaultAsync(m => m.Id.ToString() == mediaId)
            ?? throw new Exception("Media not found!");

        if (media.UserId != userId)
            throw new UnauthorizedAccessException("You don't have permission to change this media's thumbnail.");

        media.ThumbnailUrl = $"thumb_{mediaId}";
        await _dbContext.SaveChangesAsync();
    }
}
