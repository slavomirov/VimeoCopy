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

    /// <summary>Public artist profile by handle (anonymous). Must stay last so it doesn't shadow other routes.</summary>
    [HttpGet("{handle}")]
    public async Task<IActionResult> GetByHandle(string handle)
    {
        var profile = await _profileService.GetPublicProfileAsync(handle);
        return profile is null ? NotFound(new { message = "Profile not found." }) : Ok(profile);
    }
}
