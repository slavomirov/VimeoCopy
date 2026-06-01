using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
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
    private readonly string[] allowedUploadContentTypes = ["image/jpeg", "image/png", "video/mp4", "video/webm", "video/quicktime"];
    private readonly IMediaService _mediaService;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IUserService _userService;
    private readonly IBandwidthService _bandwidthService;
    private record PresignedRequest(string url, string mediaId);


    public UploadService(
        IAmazonS3 s3,
        IConfiguration config,
        AppDbContext dbContext,
        IMediaService mediaService,
        IHttpContextAccessor httpContextAccessor,
        IUserService userService,
        IBandwidthService bandwidthService)
    {
        _s3 = s3;
        _config = config;
        _dbContext = dbContext;
        _mediaService = mediaService;
        _httpContextAccessor = httpContextAccessor;
        _userService = userService;
        _bandwidthService = bandwidthService;
    }

    public async Task<MediaURLDTO> GetMediaURLAsync(string mediaId)
    {
        var media = await _mediaService.GetMediaByIdAsync(mediaId) ?? throw new Exception("Media with this id not found!");

        var allowed = await _bandwidthService.TrackPresignAsync(media, BandwidthSource.Owner);
        if (!allowed)
            throw new Exception("This media's owner has exceeded their monthly bandwidth allowance.");

        var bucket = _config["Aws:BucketName"];

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = mediaId, // или отделно поле StorageKey
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        };

        var url = _s3.GetPreSignedURL(request);

        return new MediaURLDTO()
        {
            MediaId = media.Id,
            Url = url,
            ContentType = media.ContentType
        };
    }

    public PresignRequestDTO GetPresignedUrl()
    {
        var bucket = _config["AWS:BucketName"];
        var mediaId = Guid.NewGuid().ToString();

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = mediaId,
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddHours(2), // large files on slow links can exceed a short window
            ContentType = "application/octet-stream"
        };

        var thumbRequest = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = $"thumb_{mediaId}",
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddHours(2), // large files on slow links can exceed a short window
            ContentType = "image/jpeg"
        };

        return new PresignRequestDTO
        {
            Url = _s3.GetPreSignedURL(request),
            MediaId = mediaId,
            ThumbnailUploadUrl = _s3.GetPreSignedURL(thumbRequest)
        };
    }

    public List<PresignRequestDTO> GetPresignedUrls(int count)
    {
        if (count < 1) count = 1;
        if (count > 20) count = 20;

        var results = new List<PresignRequestDTO>(count);
        for (int i = 0; i < count; i++)
        {
            results.Add(GetPresignedUrl());
        }
        return results;
    }

    public async Task<MediaDTO> UploadCompleteAsync(MediaUploadCompleteDTO input)
    {
        // require authenticated user so UserId can be non-nullable
        var userId = _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new Exception("Authentication required to complete upload.");

        if (!allowedUploadContentTypes.Contains(input.ContentType))
            throw new Exception("Unsupported content type");

        // Trust the bucket, not the client: read the real object size so the storage quota can't be spoofed.
        long actualSize;
        try
        {
            var meta = await _s3.GetObjectMetadataAsync(_config["AWS:BucketName"], input.MediaId);
            actualSize = meta.ContentLength;
        }
        catch
        {
            throw new Exception("Uploaded file was not found in storage.");
        }

        if (actualSize <= 0)
            throw new Exception("Invalid file size.");

        var result = await _userService.CanUserUploadAsync(userId, actualSize);
        if (result != "Yes")
            throw new Exception(result);

        var mediaRecord = new Media
        {
            Id = Guid.Parse(input.MediaId),
            FileSize = actualSize,
            ContentType = input.ContentType,
            UploadedAt = DateTime.UtcNow,
            UserId = userId,
            IsPublic = input.IsPublic,
            FileName = input.FileName,
            ThumbnailUrl = input.HasThumbnail ? $"thumb_{input.MediaId}" : null
        };

        await _dbContext.Media.AddAsync(mediaRecord);
        await _userService.IncreaseUsedMemoryAsync(userId, actualSize); // real bytes from storage

        // Auto-link to project if ProjectId provided
        if (input.ProjectId.HasValue)
        {
            var project = await _dbContext.Set<VimeoCopyApi.Models.Project>()
                .Include(p => p.ProjectMedias)
                .FirstOrDefaultAsync(p => p.Id == input.ProjectId.Value && p.UserId == userId);

            if (project != null)
            {
                var maxSort = project.ProjectMedias.Any()
                    ? project.ProjectMedias.Max(pm => pm.SortOrder)
                    : -1;

                _dbContext.Set<VimeoCopyAPI.Models.ProjectMedia>().Add(new VimeoCopyAPI.Models.ProjectMedia
                {
                    ProjectId = project.Id,
                    MediaId = mediaRecord.Id,
                    SortOrder = maxSort + 1,
                });

                project.UpdatedAt = DateTime.UtcNow;

                // Auto-set thumbnail if project has none and media is image/video
                if (!project.ThumbnailMediaId.HasValue &&
                    (mediaRecord.ContentType.StartsWith("image/") || mediaRecord.ContentType.StartsWith("video/")))
                {
                    project.ThumbnailMediaId = mediaRecord.Id;
                }
            }
        }

        await _dbContext.SaveChangesAsync();

        // Return DTO without circular references
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
}
