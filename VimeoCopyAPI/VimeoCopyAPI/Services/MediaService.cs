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

    public MediaService(AppDbContext dbContext, IAmazonS3 s3, IConfiguration config, IHttpContextAccessor httpContextAccessor)
    {
        _dbContext = dbContext;
        _s3 = s3;
        _config = config;
        _httpContextAccessor = httpContextAccessor;
        bucket = _config["AWS:BucketName"];
    }

    public async Task<IEnumerable<Media>> GetAllMediaAsync()
        => await _dbContext.Media.OrderByDescending(m => m.UploadedAt).ToListAsync();

    public async Task<Media?> GetMediaByIdAsync(string mediaId) => await _dbContext.Media.FirstOrDefaultAsync(x => x.Id.ToString() == mediaId);

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

        return new() { URL = url, ContentType = media.ContentType };
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

        _dbContext.Remove(media);
        await _dbContext.SaveChangesAsync();
     
        var result = await _s3.DeleteObjectAsync(new DeleteObjectRequest
        {
            BucketName = bucket,
            Key = mediaId
        });
    }
}
