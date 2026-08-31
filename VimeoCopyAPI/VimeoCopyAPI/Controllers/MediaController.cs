using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/media")]
[Authorize] // mutations require auth; public reads opt out with [AllowAnonymous]
public class MediaController : ControllerBase
{
    private readonly IMediaService _mediaService;

    public MediaController(IMediaService mediaService)
    {
        _mediaService = mediaService;
    }

    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int skip = 0, [FromQuery] int take = 24)
        => Ok(await _mediaService.GetAllMediaAsync(skip, take));

    /// <summary>Metered streaming URL — call when the viewer actually opens/plays the media. Private media is owner-only.</summary>
    [AllowAnonymous]
    [HttpGet("{id}/url")]
    public async Task<IActionResult> GetPresignedGetUrl(string id, [FromQuery] string? source = null)
        => Ok(await _mediaService.GetPresignedURLAsync(id, source));

    /// <summary>Unmetered preview URL — call to render thumbnails/posters in a gallery. Private media is owner-only.</summary>
    [AllowAnonymous]
    [HttpGet("{id}/preview")]
    public async Task<IActionResult> GetPreviewUrl(string id) => Ok(await _mediaService.GetPreviewURLAsync(id));

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

    [HttpPatch("{mediaId}/details")]
    public async Task<IActionResult> UpdateMediaDetails(string mediaId, [FromBody] UpdateMediaDetailsDTO dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        await _mediaService.UpdateMediaDetailsAsync(mediaId, userId, dto);
        return Ok(new { message = "Media details updated successfully." });
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
