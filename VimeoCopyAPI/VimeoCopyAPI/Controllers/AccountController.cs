using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

/// <summary>Account & privacy self-service: change password, export data (GDPR portability), delete account (erasure).</summary>
[ApiController]
[Route("api/account")]
[Authorize]
public class AccountController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IUserService _userService;

    public AccountController(UserManager<ApplicationUser> userManager, IUserService userService)
    {
        _userManager = userManager;
        _userService = userService;
    }

    public record ChangePasswordDTO(string CurrentPassword, string NewPassword);

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDTO dto)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        var result = await _userManager.ChangePasswordAsync(user, dto.CurrentPassword, dto.NewPassword);
        if (!result.Succeeded)
            return BadRequest(new { message = result.Errors.FirstOrDefault()?.Description ?? "Could not change password." });

        return Ok(new { message = "Password updated." });
    }

    /// <summary>Returns the caller's data as a JSON download (GDPR data portability).</summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var data = await _userService.GetUserDataAsync(userId);
        return File(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(data,
            new System.Text.Json.JsonSerializerOptions { WriteIndented = true }),
            "application/json", "vimeocopy-my-data.json");
    }

    /// <summary>Permanently deletes the caller's account. NOTE: cascades DB rows (media/projects/tokens),
    /// but the underlying R2 objects are NOT yet removed — wire S3 cleanup before relying on this for prod.</summary>
    [HttpDelete]
    public async Task<IActionResult> DeleteAccount()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
            return BadRequest(new { message = "Could not delete account." });

        Response.Cookies.Delete("refreshToken");
        return Ok(new { message = "Account deleted." });
    }
}
