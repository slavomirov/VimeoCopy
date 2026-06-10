using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using VimeoCopyApi.Data;
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
    private readonly AppDbContext _db;
    private readonly IAmazonS3 _s3;
    private readonly string? _bucket;

    public AccountController(UserManager<ApplicationUser> userManager, IUserService userService,
        AppDbContext db, IAmazonS3 s3, IConfiguration config)
    {
        _userManager = userManager;
        _userService = userService;
        _db = db;
        _s3 = s3;
        _bucket = config["AWS:BucketName"];
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

    /// <summary>Permanently deletes the caller's account. Removes their R2 objects (originals + thumbnails)
    /// first, then deletes the user — Identity cascades the DB rows (media/projects/tokens).</summary>
    [HttpDelete]
    public async Task<IActionResult> DeleteAccount()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        // Remove storage objects BEFORE the DB cascade wipes the media rows, or the keys are lost (orphaned R2 objects).
        var media = await _db.Media.AsNoTracking()
            .Where(m => m.UserId == user.Id)
            .Select(m => new { m.Id, m.ThumbnailUrl })
            .ToListAsync();

        foreach (var m in media)
        {
            try { await _s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = _bucket, Key = m.Id.ToString() }); }
            catch { /* best-effort: keep deleting the rest */ }

            if (!string.IsNullOrEmpty(m.ThumbnailUrl))
            {
                try { await _s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = _bucket, Key = m.ThumbnailUrl }); }
                catch { /* thumbnail delete is best-effort */ }
            }
        }

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
            return BadRequest(new { message = "Could not delete account." });

        Response.Cookies.Delete("refreshToken");
        return Ok(new { message = "Account deleted." });
    }
}
