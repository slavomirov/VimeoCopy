using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
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

    public MediaService(AppDbContext dbContext, IAmazonS3 s3, IConfiguration config)
    {
        _dbContext = dbContext;
        _s3 = s3;
        _config = config;
    }

    public async Task<IEnumerable<Media>> GetAllMediaAsync()
        => await _dbContext.Media.OrderByDescending(m => m.UploadedAt).ToListAsync();

    public async Task<Media?> GetMediaByIdAsync(string mediaId) => await _dbContext.Media.FirstOrDefaultAsync(x => x.Id.ToString() == mediaId);

    //public async Task<IEnumerable<Media>> GetMediaByIdUserAsync(string userId) => await _dbContext.Media.Where(m => m.UserId == userId).ToListAsync();

    public async Task<GetPresignedURLDTO> GetPresignedURLAsync(string mediaId)
    {
        var media = await GetMediaByIdAsync(mediaId) ?? throw new Exception("Media with this id not found!");

        var bucket = _config["AWS:BucketName"];

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = media.FileName,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        };

        var url = _s3.GetPreSignedURL(request);

        return new() { URL = url, ContentType = media.ContentType };
    }
}
