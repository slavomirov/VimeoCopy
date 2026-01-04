using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Mvc;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UploadController : ControllerBase
{
    private readonly IAmazonS3 _s3;
    private readonly IConfiguration _config;
    private readonly AppDbContext _dbContext;
    private readonly string[] allowedUploadContentTypes = new[] { "image/jpeg", "image/png", "video/mp4", "video/webm" };

    public UploadController(IAmazonS3 s3, IConfiguration config, AppDbContext dbContext)
    {
        _s3 = s3;
        _config = config;
        _dbContext = dbContext;
    }

    [HttpPost("url")]
    public IActionResult GetPresignedUrl([FromBody] PresignRequest input)
    {
        var bucket = _config["AWS:BucketName"];

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = input.FileName, //+ userId + GUID/проверка в базата ако има такъв/ива fileName за този потребител, да се сложи (n брой) след името
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddMinutes(15),
            ContentType = "application/octet-stream"
        };

        var url = _s3.GetPreSignedURL(request);

        return Ok(new { url }); //+ new FileName
    }


    [HttpPost("complete")]
    public IActionResult UploadComplete([FromBody] UploadCompleteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FileName))
            return BadRequest("FileName is required.");

        if (request.FileSize <= 0)
            return BadRequest("Invalid file size.");

        if (!allowedUploadContentTypes.Contains(request.ContentType)) 
            return BadRequest("Unsupported content type");

        var mediaId = Guid.NewGuid();

        var mediaRecord = new Media
        {
            Id = mediaId,
            FileName = request.FileName,
            FileSize = request.FileSize,
            ContentType = request.ContentType,
            UploadedAt = DateTime.UtcNow
        };

        _dbContext.Media.Add(mediaRecord);
        _dbContext.SaveChanges();
        return Ok(mediaRecord);
    }

    [HttpGet("media/{id}/url")]
    public async Task<IActionResult> GetMediaUrl(Guid id)
    {
        var media = await _dbContext.Media.FindAsync(id);
        if (media == null)
            return NotFound();

        var bucket = _config["Aws:BucketName"];

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = media.FileName, // или отделно поле StorageKey
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        };

        var url = _s3.GetPreSignedURL(request);

        return Ok(new
        {
            id = media.Id,
            url,
            contentType = media.ContentType
        });
    }

    [HttpGet("media")]
    public IActionResult GetMedia()
    {
        var items = _dbContext.Media
            .OrderByDescending(m => m.UploadedAt)
            .Select(m => new
            {
                m.Id,
                m.FileName,
                m.FileSize,
                m.ContentType,
                m.Status,
                m.UploadedAt
            })
            .ToList();

        return Ok(items);
    }

}
