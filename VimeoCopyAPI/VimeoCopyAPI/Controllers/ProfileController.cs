using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/profiles")]
public class ProfileController : ControllerBase
{
    private readonly IProfileService _profileService;

    public ProfileController(IProfileService profileService)
    {
        _profileService = profileService;
    }

    /// <summary>Search public artist profiles (anonymous).</summary>
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q)
        => Ok(await _profileService.SearchProfilesAsync(q));

    /// <summary>The signed-in user's editable profile settings.</summary>
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetMine()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        var profile = await _profileService.GetMyProfileAsync(userId);
        return profile is null ? NotFound() : Ok(profile);
    }

    /// <summary>Update the signed-in user's profile.</summary>
    [Authorize]
    [HttpPut("me")]
    public async Task<IActionResult> UpdateMine([FromBody] UpdateProfileDTO dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        await _profileService.UpdateProfileAsync(userId, dto);
        return Ok(new { message = "Profile updated successfully." });
    }

    /// <summary>Presigned PUT so the owner can upload an avatar/banner from their own device.</summary>
    [Authorize]
    [HttpPost("me/images/upload-url")]
    public async Task<IActionResult> CreateImageUploadUrl([FromBody] ProfileImageUploadRequestDTO dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        return Ok(await _profileService.CreateProfileImageUploadUrlAsync(userId, dto.ContentType));
    }

    /// <summary>Confirms an uploaded avatar/banner and attaches it to the signed-in user's profile.</summary>
    [Authorize]
    [HttpPost("me/images")]
    public async Task<IActionResult> ConfirmImage([FromBody] ConfirmProfileImageDTO dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

        return Ok(await _profileService.ConfirmProfileImageAsync(userId, dto));
    }

    /// <summary>Public artist profile by handle (anonymous). Must stay last so it doesn't shadow other routes.</summary>
    [HttpGet("{handle}")]
    public async Task<IActionResult> GetByHandle(string handle)
    {
        var profile = await _profileService.GetPublicProfileAsync(handle);
        return profile is null ? NotFound(new { message = "Profile not found." }) : Ok(profile);
    }
}
