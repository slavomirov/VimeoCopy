using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
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
    private readonly IMediaService _media;

    public DownloadRequestController(IDownloadRequestService requests, IMediaService media)
    {
        _requests = requests;
        _media = media;
    }

    private string CurrentUserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

    /// <summary>Asks the owner for a file. Emails them and lands in their Requests page.</summary>
    [EnableRateLimiting("download-request")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDownloadRequestDTO dto)
        => Ok(await _requests.CreateAsync(CurrentUserId, dto));

    /// <summary>Asks an artist for their whole showreel, from their public profile.</summary>
    [EnableRateLimiting("download-request")]
    [HttpPost("showreel")]
    public async Task<IActionResult> CreateShowreel([FromBody] CreateShowreelRequestDTO dto)
        => Ok(await _requests.CreateShowreelAsync(CurrentUserId, dto));

    /// <summary>
    /// Streams an approved showreel as a zip.
    ///
    /// The archive is built and sent in one pass rather than assembled somewhere first — a bundle
    /// can be gigabytes, and staging it on disk or in memory to hand back a link would cost that
    /// twice. The owner may always take their own.
    /// </summary>
    [HttpGet("showreel/{handle}/zip")]
    public async Task<IActionResult> DownloadShowreel(string handle, CancellationToken ct)
    {
        var owner = await _requests.ResolveShowreelOwnerAsync(handle, CurrentUserId);

        // ZipArchive finishes the archive in Dispose, and that final central-directory write is
        // SYNCHRONOUS — there is no async equivalent in the BCL. Kestrel forbids synchronous writes
        // to the response body by default, so without this the archive streams correctly and then
        // throws on the very last write, handing the caller a 500 and a truncated file.
        //
        // Scoped to this one request rather than switched on server-wide: every other endpoint
        // should keep the protection, and the alternative — buffering the whole archive in memory
        // or on disk before sending it — costs the bundle's full size for no benefit.
        var bodyControl = HttpContext.Features.Get<IHttpBodyControlFeature>();
        if (bodyControl is not null) bodyControl.AllowSynchronousIO = true;

        // Content-Length is unknown until the last byte is written, so this is a chunked response.
        // Setting the filename here is what makes the browser save it instead of trying to show it.
        Response.ContentType = "application/zip";
        Response.Headers.ContentDisposition = $"attachment; filename=\"{owner.FileName}\"";

        await _media.WriteShowreelZipAsync(owner.OwnerUserId, Response.Body, ct);
        return new EmptyResult();
    }

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
