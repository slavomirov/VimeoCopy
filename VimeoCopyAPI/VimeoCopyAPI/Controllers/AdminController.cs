using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

/// <summary>
/// Administration: other people's accounts, other people's files, and the plans everyone sits on.
///
/// The role gate is on the class, not on the actions, so a route added later is locked by default
/// rather than by remembering to lock it. Moderator is deliberately NOT enough here — moderators
/// hide reported media through <see cref="ReportController"/>; this controller hands out paid
/// plans, deletes accounts and edits pricing, which is a different kind of authority.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly IAdminService _admin;

    public AdminController(IAdminService admin) => _admin = admin;

    /// <summary>
    /// Who is acting. Read from the token on every call rather than accepted as a parameter — an
    /// actor the caller can state is an actor the caller can forge, and this one signs the audit log.
    /// </summary>
    private string ActorId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

    // ── Overview ───────────────────────────────────────────

    [HttpGet("overview")]
    public async Task<IActionResult> Overview() => Ok(await _admin.GetOverviewAsync());

    // ── Users ──────────────────────────────────────────────

    [HttpGet("users")]
    public async Task<IActionResult> Users([FromQuery] string? q, [FromQuery] int skip = 0, [FromQuery] int take = 25)
        => Ok(await _admin.SearchUsersAsync(q, skip, take));

    [HttpGet("users/{userId}")]
    public async Task<IActionResult> UserDetail(string userId) => Ok(await _admin.GetUserAsync(userId));

    /// <summary>Puts a user on a plan without them paying.</summary>
    [HttpPost("users/{userId}/plan")]
    public async Task<IActionResult> GrantPlan(string userId, [FromBody] AdminGrantPlanDTO dto)
        => Ok(await _admin.GrantPlanAsync(ActorId, userId, dto));

    /// <summary>Adds or removes storage on top of the plan. Signed delta, in bytes.</summary>
    [HttpPost("users/{userId}/storage")]
    public async Task<IActionResult> GrantStorage(string userId, [FromBody] AdminGrantQuotaDTO dto)
        => Ok(await _admin.GrantStorageAsync(ActorId, userId, dto));

    /// <summary>Adds or removes bandwidth on top of the plan. Signed delta, in bytes.</summary>
    [HttpPost("users/{userId}/bandwidth")]
    public async Task<IActionResult> GrantBandwidth(string userId, [FromBody] AdminGrantQuotaDTO dto)
        => Ok(await _admin.GrantBandwidthAsync(ActorId, userId, dto));

    /// <summary>Zeroes this cycle's usage without changing the allowance.</summary>
    [HttpPost("users/{userId}/bandwidth/reset")]
    public async Task<IActionResult> ResetBandwidth(string userId)
        => Ok(await _admin.ResetBandwidthAsync(ActorId, userId));

    [HttpPut("users/{userId}/roles")]
    public async Task<IActionResult> SetRoles(string userId, [FromBody] AdminSetRolesDTO dto)
        => Ok(await _admin.SetRolesAsync(ActorId, userId, dto));

    [HttpPost("users/{userId}/suspend")]
    public async Task<IActionResult> Suspend(string userId, [FromBody] AdminSuspendDTO dto)
        => Ok(await _admin.SetSuspendedAsync(ActorId, userId, dto));

    [HttpPost("users/{userId}/profile-visibility")]
    public async Task<IActionResult> ProfileVisibility(string userId, [FromBody] AdminSetFlagDTO dto)
        => Ok(await _admin.SetProfileVisibilityAsync(ActorId, userId, dto));

    /// <summary>Deletes the account and everything it stored. There is no undo.</summary>
    [HttpDelete("users/{userId}")]
    public async Task<IActionResult> DeleteUser(string userId)
    {
        await _admin.DeleteUserAsync(ActorId, userId);
        return Ok(new { message = "Account deleted." });
    }

    // ── Media ──────────────────────────────────────────────

    [HttpGet("media")]
    public async Task<IActionResult> Media(
        [FromQuery] string? q,
        [FromQuery] string? ownerId,
        [FromQuery] string? visibility,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 25)
        => Ok(await _admin.SearchMediaAsync(q, ownerId, visibility, skip, take));

    /// <summary>Hides a file, or puts it back.</summary>
    [HttpPost("media/{mediaId}/visibility")]
    public async Task<IActionResult> MediaVisibility(string mediaId, [FromBody] AdminMediaVisibilityDTO dto)
        => Ok(await _admin.SetMediaVisibilityAsync(ActorId, mediaId, dto));

    [HttpPost("media/{mediaId}/downloadable")]
    public async Task<IActionResult> MediaDownloadable(string mediaId, [FromBody] AdminSetFlagDTO dto)
        => Ok(await _admin.SetMediaDownloadableAsync(ActorId, mediaId, dto));

    /// <summary>Deletes the file and its bucket objects, and refunds the owner's quota.</summary>
    [HttpDelete("media/{mediaId}")]
    public async Task<IActionResult> DeleteMedia(string mediaId)
    {
        await _admin.DeleteMediaAsync(ActorId, mediaId);
        return Ok(new { message = "Media deleted." });
    }

    // ── Plans ──────────────────────────────────────────────

    [HttpGet("plans")]
    public async Task<IActionResult> Plans() => Ok(await _admin.GetPlansAsync());

    [HttpPut("plans/{planId:int}")]
    public async Task<IActionResult> UpdatePlan(int planId, [FromBody] AdminUpdatePlanDTO dto)
        => Ok(await _admin.UpdatePlanAsync(ActorId, planId, dto));

    // ── Audit log ──────────────────────────────────────────

    [HttpGet("audit")]
    public async Task<IActionResult> Audit([FromQuery] int skip = 0, [FromQuery] int take = 50)
        => Ok(await _admin.GetAuditLogAsync(skip, take));
}
