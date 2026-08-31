using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // minting presigned PUT URLs must require a logged-in user
[EnableRateLimiting("presign")]
public class UploadController : ControllerBase
{
    private readonly IUploadService _uploadService;
    private readonly IMediaService _mediaService;

    public UploadController(IUploadService uploadService, IMediaService mediaService)
    {
        _uploadService = uploadService;
        _mediaService = mediaService;
    }

    /// <summary>What the server will accept. The client builds its file picker from this so the two
    /// can't drift apart — a mismatch means uploads that transfer fully and then fail.</summary>
    [AllowAnonymous]
    [HttpGet("allowed-types")]
    public IActionResult AllowedTypes() => Ok(new { contentTypes = _uploadService.AllowedContentTypes });

    [HttpGet("url")]
    public async Task<IActionResult> GetPresignedUrl([FromQuery] string contentType)
        => Ok(await _uploadService.GetPresignedUrlAsync(contentType));

    [HttpPost("urls")]
    public async Task<IActionResult> GetPresignedUrls([FromBody] BatchPresignRequest request)
        => Ok(await _uploadService.GetPresignedUrlsAsync(request.ContentTypes));

    [HttpPost("complete")]
    public async Task<IActionResult> UploadComplete([FromBody] MediaUploadCompleteDTO input)
        => Ok(await _uploadService.UploadCompleteAsync(input));

    // NOTE: there was a GetMediaUrl action here that presigned any media id with no ownership or
    // privacy check. Its route said {id} while the parameter was mediaId, so the value bound from
    // the query string instead and the endpoint was fully reachable. Streaming URLs are minted only
    // by MediaController, which resolves visibility first. Don't reintroduce a presign path here.

    [HttpGet("media")]
    public async Task<IActionResult> GetMedia()
        => Ok(await _mediaService.GetAllMediaAsync());
}

public class BatchPresignRequest
{
    /// <summary>One entry per file, in the client's queue order. Max 20 per call.</summary>
    public List<string> ContentTypes { get; set; } = [];
}
