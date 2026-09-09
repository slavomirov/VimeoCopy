using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/reports")]
public class ReportController : ControllerBase
{
    private readonly IReportService _reports;

    public ReportController(IReportService reports) => _reports = reports;

    /// <summary>Anyone (incl. anonymous visitors) can report public media. Rate-limited to deter spam.</summary>
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ReportCreateDTO dto)
    {
        var reporterUserId = User.FindFirstValue(ClaimTypes.NameIdentifier); // null if anonymous
        await _reports.CreateAsync(dto, reporterUserId);
        return Ok(new { message = "Thanks — we'll review this." });
    }

    [Authorize(Roles = "Admin")]
    [HttpGet]
    public async Task<IActionResult> Pending() => Ok(await _reports.GetPendingAsync());

    /// <summary>
    /// Closes a report: hide the media, delete it, or dismiss and leave it alone.
    ///
    /// Administrators only. There is no moderator tier — the role split that used to let a
    /// moderator hide but not delete is gone with it, so every outcome here needs the same
    /// authority and the check is the one attribute above.
    /// </summary>
    [Authorize(Roles = "Admin")]
    [HttpPost("{id}/resolve")]
    public async Task<IActionResult> Resolve(long id, [FromBody] ResolveReportDTO dto)
    {
        var reviewerId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("Not authenticated.");

        await _reports.ResolveAsync(id, dto.Action, reviewerId, dto.Reason);
        return Ok(new { message = "Report resolved." });
    }
}
