using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/shared")]
public class SharedLinkController : ControllerBase
{
    private readonly ISharedLinkService _sharedLinkService;
    private readonly IAmazonS3 _s3;
    private readonly IConfiguration _config;

    public SharedLinkController(ISharedLinkService sharedLinkService, IAmazonS3 s3, IConfiguration config)
    {
        _sharedLinkService = sharedLinkService;
        _s3 = s3;
        _config = config;
    }

    /// <summary>
    /// Authenticated owner creates a temporary share link.
    /// Body: { "mediaId": "...", "expirationHours": 24 }
    /// </summary>
    [HttpPost("create")]
    public async Task<IActionResult> CreateSharedLink([FromBody] CreateSharedLinkRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        var link = await _sharedLinkService.CreateSharedLinkAsync(
            request.MediaId, userId, request.ExpirationHours);

        return Ok(new
        {
            token = link.Token,
            expiresAt = link.ExpiresAt
        });
    }

    /// <summary>
    /// Public / anonymous endpoint — resolves the token and returns a
    /// pre-signed S3 URL + content type so the frontend viewer can display
    /// the media without any authentication.
    /// </summary>
    [HttpGet("view/{token}")]
    [AllowAnonymous]
    public async Task<IActionResult> ViewSharedMedia(string token)
    {
        var link = await _sharedLinkService.GetValidSharedLinkAsync(token);
        if (link == null)
            return NotFound(new { message = "This shared link is invalid or has expired." });

        var bucket = _config["AWS:BucketName"];
        var presignRequest = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = link.MediaId.ToString(),
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        };

        var url = _s3.GetPreSignedURL(presignRequest);

        return Ok(new
        {
            url,
            contentType = link.Media.ContentType,
            expiresAt = link.ExpiresAt
        });
    }
}

public class CreateSharedLinkRequest
{
    public string MediaId { get; set; } = default!;

    /// <summary>
    /// How many hours the link stays valid. Default 24, max 168 (7 days).
    /// </summary>
    public int ExpirationHours { get; set; } = 24;
}
