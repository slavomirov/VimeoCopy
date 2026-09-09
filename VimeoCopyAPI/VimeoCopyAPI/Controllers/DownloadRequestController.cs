using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

/// <summary>
/// Ask an owner for the original file, and answer the people who asked you.
///
/// Every route is authenticated. A request has to belong to somebody: the owner is told who is
/// asking, the answer has to be deliverable, and an approval grants that one account a download.
/// </summary>
[ApiController]
[Authorize]
[Route("api/download-requests")]
public class DownloadRequestController : ControllerBase
{
    private readonly IDownloadRequestService _requests;

    public DownloadRequestController(IDownloadRequestService requests)
    {
        _requests = requests;
    }

    private string CurrentUserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

    /// <summary>Asks the owner for a file. Emails them and lands in their Requests page.</summary>
    [EnableRateLimiting("download-request")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDownloadRequestDTO dto)
        => Ok(await _requests.CreateAsync(CurrentUserId, dto));

    /// <summary>Requests for my media — the ones I have to answer.</summary>
    [HttpGet("incoming")]
    public async Task<IActionResult> Incoming()
        => Ok(await _requests.GetIncomingAsync(CurrentUserId));

    /// <summary>Requests I have made, and where they got to.</summary>
    [HttpGet("outgoing")]
    public async Task<IActionResult> Outgoing()
        => Ok(await _requests.GetOutgoingAsync(CurrentUserId));

    /// <summary>Counts for the sidebar badge.</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
        => Ok(await _requests.GetSummaryAsync(CurrentUserId));

    /// <summary>Grants the download to that one requester.</summary>
    [HttpPost("{id:long}/approve")]
    public async Task<IActionResult> Approve(long id)
        => Ok(await _requests.DecideAsync(id, CurrentUserId, approve: true));

    /// <summary>Says no — or takes back an approval that was already given.</summary>
    [HttpPost("{id:long}/deny")]
    public async Task<IActionResult> Deny(long id)
        => Ok(await _requests.DecideAsync(id, CurrentUserId, approve: false));
}
