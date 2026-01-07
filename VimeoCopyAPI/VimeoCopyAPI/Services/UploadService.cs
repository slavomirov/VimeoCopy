using Amazon.S3;
using Amazon.S3.Model;
using Azure.Core;
using Microsoft.EntityFrameworkCore;
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
    private readonly string[] allowedUploadContentTypes = new[] { "image/jpeg", "image/png", "video/mp4", "video/webm" };
    private readonly IMediaService _mediaService;

    public UploadService(IAmazonS3 s3, IConfiguration config, AppDbContext dbContext, IMediaService mediaService)
    {
        _s3 = s3;
        _config = config;
        _dbContext = dbContext;
        _mediaService = mediaService;
    }

    public async Task<MediaURLDTO> GetMediaURLAsync(Guid mediaId)
    {
        var media = await _mediaService.GetMediaByIdAsync(mediaId) ?? throw new Exception("Media with this id not found!");

        var bucket = _config["Aws:BucketName"];

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = media.FileName, // или отделно поле StorageKey
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

    public string GetPresignedUrl(string fileName)
    {
        var bucket = _config["AWS:BucketName"];

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = fileName, //+ userId + GUID/проверка в базата ако има такъв/ива fileName за този потребител, да се сложи (n брой) след името
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddMinutes(15),
            ContentType = "application/octet-stream"
        };

        return _s3.GetPreSignedURL(request);
    }

    public async Task<Media> UploadCompleteAsync(MediaUploadCompleteDTO input)
    {
        if (string.IsNullOrWhiteSpace(input.FileName))
            throw new Exception("FileName is required.");

        if (input.FileSize <= 0)
            throw new Exception("Invalid file size.");

        if (!allowedUploadContentTypes.Contains(input.ContentType))
            throw new Exception("Unsupported content type");

        var mediaId = Guid.NewGuid();

        var mediaRecord = new Media
        {
            Id = mediaId,
            FileName = input.FileName,
            FileSize = input.FileSize,
            ContentType = input.ContentType,
            UploadedAt = DateTime.UtcNow
        };

        await _dbContext.Media.AddAsync(mediaRecord);
        await _dbContext.SaveChangesAsync();
        return mediaRecord;
    }
}
