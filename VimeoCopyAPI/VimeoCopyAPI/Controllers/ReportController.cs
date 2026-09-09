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
        return Ok(new { message = "Thanks — our moderators will review this." });
    }

    [Authorize(Roles = "Admin,Moderator")]
    [HttpGet]
    public async Task<IActionResult> Pending() => Ok(await _reports.GetPendingAsync());

    /// <summary>
    /// Closes a report. Moderators may hide or dismiss; only administrators may delete, because
    /// hiding is reversible and deleting destroys somebody's file along with every other report
    /// against it. The role split is enforced here rather than in the service, so the service stays
    /// callable from the admin surface where the caller is already known to be an administrator.
    /// </summary>
    [Authorize(Roles = "Admin,Moderator")]
    [HttpPost("{id}/resolve")]
    public async Task<IActionResult> Resolve(long id, [FromBody] ResolveReportDTO dto)
    {
        var reviewerId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("Not authenticated.");

        if (string.Equals(dto.Action, "delete", StringComparison.OrdinalIgnoreCase)
            && !User.IsInRole("Admin"))
        {
            throw new ForbiddenException("Only an administrator can delete media. You can hide it instead.");
        }

        await _reports.ResolveAsync(id, dto.Action, reviewerId, dto.Reason);
        return Ok(new { message = "Report resolved." });
    }
}
