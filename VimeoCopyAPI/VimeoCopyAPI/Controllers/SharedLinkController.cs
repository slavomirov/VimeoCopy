using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/shared")]
[Authorize] // public resolution opts out below; everything else is owner-only
public class SharedLinkController : ControllerBase
{
    private readonly ISharedLinkService _sharedLinkService;
    private readonly IAmazonS3 _s3;
    private readonly IConfiguration _config;
    private readonly IBandwidthService _bandwidthService;

    public SharedLinkController(ISharedLinkService sharedLinkService, IAmazonS3 s3, IConfiguration config, IBandwidthService bandwidthService)
    {
        _sharedLinkService = sharedLinkService;
        _s3 = s3;
        _config = config;
        _bandwidthService = bandwidthService;
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

    /// <summary>The owner's active links for one media item, so they can see and withdraw them.</summary>
    [HttpGet("for-media/{mediaId}")]
    public async Task<IActionResult> GetLinksForMedia(string mediaId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        return Ok(await _sharedLinkService.GetLinksForMediaAsync(mediaId, userId));
    }

    /// <summary>Withdraws a share link. The URL stops working immediately.</summary>
    [HttpDelete("{token}")]
    public async Task<IActionResult> RevokeSharedLink(string token)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        await _sharedLinkService.RevokeSharedLinkAsync(token, userId);
        return Ok(new { message = "Share link revoked." });
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

        var allowed = await _bandwidthService.TrackPresignAsync(link.Media, BandwidthSource.Shared);
        if (!allowed)
            return StatusCode(402, new { message = "This media's owner has exceeded their monthly bandwidth allowance." });

        var bucket = _config["AWS:BucketName"];
        var presignRequest = new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = link.MediaId.ToString(),
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15)
        };

        var url = _s3.GetPreSignedURL(presignRequest);

        string? thumbnailUrl = null;
        if (!string.IsNullOrEmpty(link.Media.ThumbnailUrl))
        {
            var thumbRequest = new GetPreSignedUrlRequest
            {
                BucketName = bucket,
                Key = link.Media.ThumbnailUrl,
                Verb = HttpVerb.GET,
                Expires = DateTime.UtcNow.AddMinutes(15)
            };
            thumbnailUrl = _s3.GetPreSignedURL(thumbRequest);
        }

        return Ok(new
        {
            url,
            contentType = link.Media.ContentType,
            expiresAt = link.ExpiresAt,
            thumbnailUrl
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
