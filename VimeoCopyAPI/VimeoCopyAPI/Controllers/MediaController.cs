using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/media")]
public class MediaController : ControllerBase
{
    private readonly IMediaService _mediaService;

    public MediaController(IMediaService mediaService)
    {
        _mediaService = mediaService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _mediaService.GetAllMediaAsync());

    [HttpGet("{id}/url")]
    public async Task<IActionResult> GetPresignedGetUrl(string id) => Ok(await _mediaService.GetPresignedURLAsync(id));

    [HttpDelete("Media/Delete/{mediaId}")]
    public async Task<IActionResult> DeleteMediaAsync(string mediaId)
    {
        await _mediaService.DeleteMediaAsync(mediaId);
        return Ok();
    }

    [HttpPatch("{mediaId}/toggle-visibility")]
    public async Task<IActionResult> ToggleVisibility(string mediaId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        await _mediaService.ToggleVisibilityAsync(mediaId, userId);
        return Ok(new { message = "Visibility toggled successfully." });
    }

    /// <summary>
    /// Returns a pre-signed PUT URL for uploading a new/replacement thumbnail for the media.
    /// </summary>
    [HttpPost("{mediaId}/thumbnail/upload-url")]
    public async Task<IActionResult> GetThumbnailUploadUrl(string mediaId)
        => Ok(await _mediaService.GetThumbnailUploadUrlAsync(mediaId));

    /// <summary>
    /// Confirms thumbnail has been uploaded to S3, writes ThumbnailUrl column.
    /// </summary>
    [HttpPost("{mediaId}/thumbnail/confirm")]
    public async Task<IActionResult> ConfirmThumbnail(string mediaId)
    {
        await _mediaService.ConfirmThumbnailAsync(mediaId);
        return Ok(new { message = "Thumbnail updated successfully." });
    }
}
