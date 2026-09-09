using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
    public async Task<IActionResult> GetAll([FromQuery] int skip = 0, [FromQuery] int take = 24, [FromQuery] bool mine = false)
        => Ok(await _mediaService.GetAllMediaAsync(skip, take, mine));

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

    /// <summary>
    /// GIF generator: returns a pre-signed PUT URL for this media's hover-preview clip. The clip is a
    /// short muted video the browser records from the source file, so the client declares which
    /// container it produced and the URL is signed for exactly that type.
    /// </summary>
    // Same policy the upload controller uses: this mints a presigned PUT, and the global 240/min
    // limiter is far too loose to be the only thing standing in front of one.
    [EnableRateLimiting("presign")]
    [HttpPost("{mediaId}/gif/upload-url")]
    public async Task<IActionResult> GetGifUploadUrl(string mediaId, [FromBody] GifUploadRequestDTO dto)
        => Ok(await _mediaService.GetGifUploadUrlAsync(mediaId, dto.ContentType));

    /// <summary>
    /// Confirms the hover-preview clip reached storage, charges it to the owner's quota and records
    /// the key. Returns the presigned clip URL so the caller can show it without another round trip.
    /// </summary>
    [HttpPost("{mediaId}/gif/confirm")]
    public async Task<IActionResult> ConfirmGif(string mediaId, [FromBody] GifUploadRequestDTO dto)
        => Ok(await _mediaService.ConfirmGifAsync(mediaId, dto.ContentType));

    /// <summary>
    /// Metered download URL. Public read: a download link is meant to be usable by a visitor, and
    /// the two gates (file flagged downloadable, owner's plan allows it) are enforced in the service.
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("presign")]
    [HttpGet("{id}/download")]
    public async Task<IActionResult> GetDownloadUrl(string id)
        => Ok(await _mediaService.GetDownloadUrlAsync(id));

    /// <summary>Owner-only: turn downloads on or off for one file.</summary>
    [HttpPatch("{mediaId}/downloadable")]
    public async Task<IActionResult> SetDownloadable(string mediaId, [FromBody] SetDownloadableDTO dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        await _mediaService.SetDownloadableAsync(mediaId, userId, dto.Downloadable);
        return Ok(new { message = dto.Downloadable ? "Downloads enabled." : "Downloads disabled." });
    }

    /// <summary>
    /// Owner-only: put a file in the showreel, or take it out.
    ///
    /// Not plan-gated, unlike the downloadable flag. Curating a portfolio is harmless on a plan
    /// that can't serve it — the set is simply not offered until the plan can — and clearing
    /// somebody's curation when their plan lapses would lose work they'd have to redo on renewal.
    /// </summary>
    [HttpPatch("{mediaId}/showreel")]
    public async Task<IActionResult> SetInShowreel(string mediaId, [FromBody] SetInShowreelDTO dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        await _mediaService.SetInShowreelAsync(mediaId, userId, dto.InShowreel);
        return Ok(new { message = dto.InShowreel ? "Added to your showreel." : "Removed from your showreel." });
    }

    /// <summary>Whether the signed-in user's plan includes downloads, so the UI can explain itself.</summary>
    [HttpGet("downloads-allowed")]
    public async Task<IActionResult> DownloadsAllowed()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        return Ok(new { allowed = await _mediaService.PlanAllowsDownloadsAsync(userId) });
    }

    /// <summary>Removes this media's hover-preview clip and refunds its bytes.</summary>
    [HttpDelete("{mediaId}/gif")]
    public async Task<IActionResult> DeleteGif(string mediaId)
    {
        await _mediaService.DeleteGifAsync(mediaId);
        return Ok(new { message = "Preview clip removed." });
    }
}
