using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;


public class UploadService : IUploadService
{
    private readonly IAmazonS3 _s3;
    private readonly IConfiguration _config;
    private readonly AppDbContext _dbContext;
    private readonly string[] allowedUploadContentTypes = ["image/jpeg", "image/png", "video/mp4", "video/webm"];
    private readonly IMediaService _mediaService;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IUserService _userService;
    private record PresignedRequest(string url, string mediaId);


    public UploadService(
        IAmazonS3 s3,
        IConfiguration config,
        AppDbContext dbContext,
        IMediaService mediaService,
        IHttpContextAccessor httpContextAccessor,
        IUserService userService)
    {
        _s3 = s3;
        _config = config;
        _dbContext = dbContext;
        _mediaService = mediaService;
        _httpContextAccessor = httpContextAccessor;
        _userService = userService;
    }

    public async Task<MediaURLDTO> GetMediaURLAsync(string mediaId)
    {
        var media = await _mediaService.GetMediaByIdAsync(mediaId) ?? throw new Exception("Media with this id not found!");

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
            URL = url,
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
            Expires = DateTime.UtcNow.AddMinutes(15),
            ContentType = "application/octet-stream"
        };

        return new PresignRequestDTO { Url = _s3.GetPreSignedURL(request), MediaId = mediaId };
    }

    public async Task<MediaDTO> UploadCompleteAsync(MediaUploadCompleteDTO input)
    {
        // require authenticated user so UserId can be non-nullable
        var userId = _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new Exception("Authentication required to complete upload.");

        if (input.FileSize <= 0)
            throw new Exception("Invalid file size.");

        if (!allowedUploadContentTypes.Contains(input.ContentType))
            throw new Exception("Unsupported content type");

        var result = await _userService.CanUserUploadAsync(userId, input.FileSize);
        if (result != "Yes")
            throw new Exception(result);

        var mediaRecord = new Media
        {
            Id = Guid.Parse(input.MediaId),
            FileSize = input.FileSize,
            ContentType = input.ContentType,
            UploadedAt = DateTime.UtcNow,
            UserId = userId
        };

        await _dbContext.Media.AddAsync(mediaRecord);
        await _userService.IncreaseUsedMemoryAsync(userId, input.FileSize);
        await _dbContext.SaveChangesAsync();

        // Return DTO without circular references
        return new MediaDTO
        {
            Id = mediaRecord.Id,
            ContentType = mediaRecord.ContentType,
            FileSize = mediaRecord.FileSize,
            UploadedAt = mediaRecord.UploadedAt,
            Status = mediaRecord.Status
        };
    }
}
