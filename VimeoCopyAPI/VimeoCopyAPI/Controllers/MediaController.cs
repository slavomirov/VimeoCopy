using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;

namespace VimeoCopyAPI.Controllers;
[ApiController]
[Route("api/media")]
public class MediaController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAmazonS3 _s3;
    private readonly IConfiguration _config;

    public MediaController(AppDbContext db, IAmazonS3 s3, IConfiguration config)
    {
        _db = db;
        _s3 = s3;
        _config = config;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var items = await _db.Media
            .OrderByDescending(m => m.UploadedAt)
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("{id}/url")]
    public async Task<IActionResult> GetPresignedGetUrl(Guid id)
    {
        var media = await _db.Media.FindAsync(id);
        if (media == null)
            return NotFound();

        var bucket = _config["AWS:BucketName"];

        var request = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = media.FileName,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        };

        var url = _s3.GetPreSignedURL(request);

        return Ok(new { url, media.ContentType });
    }

}
