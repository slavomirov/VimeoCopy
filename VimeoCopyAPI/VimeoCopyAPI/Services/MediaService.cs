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

    public MediaService(AppDbContext dbContext, IAmazonS3 s3, IConfiguration config, IHttpContextAccessor httpContextAccessor, IUserService userService)
    {
        _dbContext = dbContext;
        _s3 = s3;
        _config = config;
        _httpContextAccessor = httpContextAccessor;
        bucket = _config["AWS:BucketName"];
        _userService = userService;
    }

    public async Task<IEnumerable<Media>> GetAllMediaAsync()
        => await _dbContext.Media
            .Where(m => m.IsPublic)
            .OrderByDescending(m => m.UploadedAt)
            .ToListAsync();

    public async Task<IEnumerable<Media>> GetUserMediaAsync(string userId)
        => await _dbContext.Media
            .Where(m => m.UserId == userId)
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

    public async Task<GetPresignedURLDTO> GetPresignedURLAsync(string mediaId)
    {
        var media = await GetMediaByIdAsync(mediaId) ?? throw new Exception("Media with this id not found!");

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = mediaId,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        };

        var url = _s3.GetPreSignedURL(request);

        string? thumbnailUrl = null;
        if (!string.IsNullOrEmpty(media.ThumbnailUrl))
        {
            var thumbRequest = new GetPreSignedUrlRequest
            {
                BucketName = bucket,
                Key = media.ThumbnailUrl,
                Verb = HttpVerb.GET,
                Expires = DateTime.UtcNow.AddMinutes(15)
            };
            thumbnailUrl = _s3.GetPreSignedURL(thumbRequest);
        }

        return new() { URL = url, ContentType = media.ContentType, ThumbnailUrl = thumbnailUrl };
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

        await _userService.DecreaseUsedMemoryAsync(userId, media.FileSize);
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
