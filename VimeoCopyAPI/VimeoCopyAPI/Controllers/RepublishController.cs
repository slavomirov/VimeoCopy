using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

/// <summary>
/// Appeals against takedowns.
///
/// Two audiences on one route prefix: an owner filing and tracking their own appeals, and an
/// administrator answering them. The split is per-action rather than per-controller because the
/// owner half is meaningless without the staff half, and keeping them together makes the pairing
/// obvious to whoever reads this next.
/// </summary>
[ApiController]
[Authorize]
[Route("api/republish-requests")]
public class RepublishController : ControllerBase
{
    private readonly IRepublishService _republish;

    public RepublishController(IRepublishService republish) => _republish = republish;

    private string CurrentUserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

    /// <summary>Owner: appeal a takedown. Rate-limited — an appeal reaches a human.</summary>
    [EnableRateLimiting("download-request")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRepublishRequestDTO dto)
        => Ok(await _republish.CreateAsync(CurrentUserId, dto));

    /// <summary>Owner: my appeals and where they got to.</summary>
    [HttpGet("mine")]
    public async Task<IActionResult> Mine() => Ok(await _republish.GetMineAsync(CurrentUserId));

    /// <summary>Staff: appeals waiting for an answer.</summary>
    [Authorize(Roles = "Admin")]
    [HttpGet]
    public async Task<IActionResult> Pending() => Ok(await _republish.GetPendingAsync());

    /// <summary>Staff: answer one. Approving puts the file back and hands visibility to the owner.</summary>
    [Authorize(Roles = "Admin")]
    [HttpPost("{id:long}/decide")]
    public async Task<IActionResult> Decide(long id, [FromBody] DecideRepublishRequestDTO dto)
        => Ok(await _republish.DecideAsync(id, CurrentUserId, dto));
}
