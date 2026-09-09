using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

/// <summary>
/// Download requests: ask the owner, wait for the answer.
///
/// The permission this produces is deliberately narrow — one requester, one file — and it is read
/// back by MediaService.GetDownloadUrlAsync, which stays the only place that hands out a download.
/// Nothing here presigns anything.
/// </summary>
public class DownloadRequestService : IDownloadRequestService
{
    private readonly AppDbContext _db;
    private readonly IMediaService _mediaService;
    private readonly IEmailService _emailService;
    private readonly ILogger<DownloadRequestService> _logger;

    /// <summary>Mirrors DownloadRequest.Message's column width.</summary>
    private const int MaxMessageLength = 500;

    /// <summary>
    /// How many requests one account may open in a day. The endpoint is rate-limited per minute
    /// as well; this is the slower ceiling that stops someone papering every creator on the site.
    /// </summary>
    private const int MaxRequestsPerDay = 30;

    /// <summary>How long a declined answer stands before the same file can be asked for again.</summary>
    private static readonly TimeSpan DenialCooldown = TimeSpan.FromDays(7);

    public DownloadRequestService(
        AppDbContext db,
        IMediaService mediaService,
        IEmailService emailService,
        ILogger<DownloadRequestService> logger)
    {
        _db = db;
        _mediaService = mediaService;
        _emailService = emailService;
        _logger = logger;
    }

    public async Task<DownloadRequestDTO> CreateAsync(string requesterUserId, CreateDownloadRequestDTO dto)
    {
        var media = await _db.Media.AsNoTracking().FirstOrDefaultAsync(m => m.Id == dto.MediaId)
            ?? throw new NotFoundException("Media not found.");

        // A profile asset is the owner's private decoration, not a work anyone can ask for.
        if (media.IsProfileAsset)
            throw new NotFoundException("Media not found.");

        // Asking for your own file is a no-op with a confusing inbox entry attached.
        if (media.UserId == requesterUserId)
            throw new ValidationException("This is your own file — you can download it from your dashboard.");

        // Private media isn't visible to this person, so it must not be discoverable by asking either.
        if (!media.IsPublic)
            throw new NotFoundException("Media not found.");

        // The gate. Downloads belong to the plans that include them, and an owner who cannot serve
        // a download must not be able to promise one: approving would create a grant that the
        // download endpoint then refuses, which is a worse experience than never offering it.
        if (!await _mediaService.PlanAllowsDownloadsAsync(media.UserId))
            throw new ForbiddenException("This creator's plan doesn't offer file downloads.");

        // Already open to everyone — nothing to ask for.
        if (media.Downloadable)
            throw new ValidationException("This file is already available to download.");

        // Newest answer for this pair decides what happens next.
        var existing = await _db.DownloadRequests
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(r => r.MediaId == dto.MediaId && r.RequesterUserId == requesterUserId);

        // Pending or already granted: hand back what is there rather than stacking duplicates in
        // the owner's inbox.
        if (existing is not null && existing.Status != DownloadRequestStatus.Denied)
            return await ToDtoAsync(existing);

        // Declined recently: a no isn't permanent, but it does have to mean something for a while.
        // Without this, "ask again" is an emailing machine pointed at the owner, bounded only by
        // the daily cap — and being pestered is exactly what an owner is protected from here.
        if (existing is not null
            && existing.Status == DownloadRequestStatus.Denied
            && existing.DecidedAt is { } deniedAt
            && deniedAt > DateTime.UtcNow - DenialCooldown)
        {
            var days = Math.Max(1, (int)Math.Ceiling((deniedAt + DenialCooldown - DateTime.UtcNow).TotalDays));
            throw new ValidationException(
                $"The owner declined this recently. You can ask again in {days} day{(days == 1 ? "" : "s")}.");
        }

        var since = DateTime.UtcNow.AddDays(-1);
        var todayCount = await _db.DownloadRequests
            .CountAsync(r => r.RequesterUserId == requesterUserId && r.CreatedAt >= since);
        if (todayCount >= MaxRequestsPerDay)
            throw new ValidationException("You've made a lot of download requests today. Try again tomorrow.");

        var request = new DownloadRequest
        {
            MediaId = media.Id,
            RequesterUserId = requesterUserId,
            OwnerUserId = media.UserId,
            Status = DownloadRequestStatus.Pending,
            Message = Trim(dto.Message),
            CreatedAt = DateTime.UtcNow,
        };

        _db.DownloadRequests.Add(request);
        await _db.SaveChangesAsync();

        await NotifyOwnerAsync(request, media);

        return await ToDtoAsync(request);
    }

    public async Task<DownloadRequestDTO> CreateShowreelAsync(string requesterUserId, CreateShowreelRequestDTO dto)
    {
        var handle = dto.Handle?.Trim();
        if (string.IsNullOrWhiteSpace(handle)) throw new ValidationException("No artist given.");

        var owner = await _db.Users.AsNoTracking()
            .Where(u => u.Handle == handle)
            .Select(u => new { u.Id, u.IsProfilePublic })
            .FirstOrDefaultAsync()
            ?? throw new NotFoundException("No artist with that handle.");

        // A hidden profile is not reachable, so it must not be reachable by asking either.
        if (!owner.IsProfilePublic) throw new NotFoundException("No artist with that handle.");

        if (owner.Id == requesterUserId)
            throw new ValidationException("This is your own showreel — you can download it from your profile.");

        if (!await _mediaService.PlanAllowsDownloadsAsync(owner.Id))
            throw new ForbiddenException("This creator's plan doesn't offer file downloads.");

        // Nothing curated means nothing to grant. Approving an empty showreel would hand over a zip
        // with no files in it, which reads as a broken download rather than as an empty portfolio.
        var count = await _db.Media.CountAsync(m => m.UserId == owner.Id && m.InShowreel && !m.IsProfileAsset);
        if (count == 0)
            throw new ValidationException("This artist hasn't put a showreel together yet.");

        var existing = await _db.DownloadRequests
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(r => r.OwnerUserId == owner.Id
                                   && r.RequesterUserId == requesterUserId
                                   && r.Kind == DownloadRequestKind.Showreel);

        if (existing is not null && existing.Status != DownloadRequestStatus.Denied)
            return await ToDtoAsync(existing);

        // Same cooling-off period as a single file. Asking for everything is if anything the more
        // annoying one to be asked twice.
        if (existing is not null
            && existing.DecidedAt is { } deniedAt
            && deniedAt > DateTime.UtcNow - DenialCooldown)
        {
            var days = Math.Max(1, (int)Math.Ceiling((deniedAt + DenialCooldown - DateTime.UtcNow).TotalDays));
            throw new ValidationException(
                $"The artist declined this recently. You can ask again in {days} day{(days == 1 ? "" : "s")}.");
        }

        var since = DateTime.UtcNow.AddDays(-1);
        var todayCount = await _db.DownloadRequests
            .CountAsync(r => r.RequesterUserId == requesterUserId && r.CreatedAt >= since);
        if (todayCount >= MaxRequestsPerDay)
            throw new ValidationException("You've made a lot of download requests today. Try again tomorrow.");

        var request = new DownloadRequest
        {
            MediaId = null,
            Kind = DownloadRequestKind.Showreel,
            RequesterUserId = requesterUserId,
            OwnerUserId = owner.Id,
            Status = DownloadRequestStatus.Pending,
            Message = Trim(dto.Message),
            CreatedAt = DateTime.UtcNow,
        };

        _db.DownloadRequests.Add(request);
        await _db.SaveChangesAsync();

        await NotifyOwnerAsync(request, media: null);

        return await ToDtoAsync(request);
    }

    public Task<bool> HasApprovedShowreelAsync(string ownerUserId, string viewerUserId)
        => _db.DownloadRequests.AsNoTracking().AnyAsync(r =>
            r.OwnerUserId == ownerUserId
            && r.RequesterUserId == viewerUserId
            && r.Kind == DownloadRequestKind.Showreel
            && r.Status == DownloadRequestStatus.Approved);

    public async Task<(string OwnerUserId, string FileName)> ResolveShowreelOwnerAsync(
        string handle, string viewerUserId)
    {
        var owner = await _db.Users.AsNoTracking()
            .Where(u => u.Handle == handle)
            .Select(u => new { u.Id, u.Handle, u.DisplayName })
            .FirstOrDefaultAsync()
            ?? throw new NotFoundException("No artist with that handle.");

        // The owner always gets their own, grant or no grant. Everyone else needs a live approval,
        // and the owner's plan still has to include downloads — a lapsed plan revokes the ability
        // to serve the bundle even though the approval row is still sitting there saying yes.
        if (owner.Id != viewerUserId)
        {
            if (!await HasApprovedShowreelAsync(owner.Id, viewerUserId))
                throw new ForbiddenException("You don't have permission to download this showreel.");

            if (!await _mediaService.PlanAllowsDownloadsAsync(owner.Id))
                throw new ForbiddenException("This creator's plan no longer offers file downloads.");
        }

        var stem = owner.Handle ?? "showreel";
        return (owner.Id, $"{stem}-showreel.zip");
    }

    public async Task<IEnumerable<DownloadRequestDTO>> GetIncomingAsync(string ownerUserId)
        => await QueryAsync(r => r.OwnerUserId == ownerUserId);

    public async Task<IEnumerable<DownloadRequestDTO>> GetOutgoingAsync(string requesterUserId)
        => await QueryAsync(r => r.RequesterUserId == requesterUserId);

    public async Task<DownloadRequestSummaryDTO> GetSummaryAsync(string userId)
    {
        // Three plain counts rather than one grouped query with conditional aggregates. Each one
        // hits an index that exists for it, they are cheap, and this cannot fail to translate —
        // which matters for a call the sidebar makes on every page load.
        var requests = _db.DownloadRequests.AsNoTracking();

        return new DownloadRequestSummaryDTO
        {
            PendingIncoming = await requests.CountAsync(r =>
                r.OwnerUserId == userId && r.Status == DownloadRequestStatus.Pending),
            PendingOutgoing = await requests.CountAsync(r =>
                r.RequesterUserId == userId && r.Status == DownloadRequestStatus.Pending),
            ApprovedOutgoing = await requests.CountAsync(r =>
                r.RequesterUserId == userId && r.Status == DownloadRequestStatus.Approved),
        };
    }

    public async Task<DownloadRequestDTO> DecideAsync(long requestId, string ownerUserId, bool approve)
    {
        var request = await _db.DownloadRequests.FirstOrDefaultAsync(r => r.Id == requestId)
            ?? throw new NotFoundException("That request no longer exists.");

        // Ownership is the authority, not the request id: ids are sequential, so without this any
        // signed-in user could decide someone else's inbox by guessing.
        if (request.OwnerUserId != ownerUserId)
            throw new ForbiddenException("That request isn't yours to answer.");

        // Approving still needs the plan to allow downloads — the owner may have lapsed since the
        // request arrived, and a grant that the download endpoint refuses is worse than a no.
        if (approve && !await _mediaService.PlanAllowsDownloadsAsync(ownerUserId))
            throw new ForbiddenException("Your plan doesn't include downloads. Upgrade to approve this request.");

        var newStatus = approve ? DownloadRequestStatus.Approved : DownloadRequestStatus.Denied;
        var changed = request.Status != newStatus;
        // Taking back an approval is a different message from declining in the first place.
        var wasApproved = request.Status == DownloadRequestStatus.Approved;

        request.Status = newStatus;
        request.DecidedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        // Only tell the requester when the answer actually moved, so re-clicking a button doesn't
        // send them a second identical email.
        if (changed) await NotifyRequesterAsync(request, approve, revoked: !approve && wasApproved);

        return await ToDtoAsync(request);
    }

    /* ── Helpers ─────────────────────────────────────────────────────────────────────────────── */

    private async Task<IEnumerable<DownloadRequestDTO>> QueryAsync(
        System.Linq.Expressions.Expression<Func<DownloadRequest, bool>> predicate)
    {
        // The join onto Media is a LEFT join, and that is the whole reason this is query syntax
        // rather than the fluent chain it used to be: a showreel row carries no MediaId, and an
        // inner join silently drops every one of them — the request would be created, emailed, and
        // then be invisible in both inboxes.
        var rows =
            from r in _db.DownloadRequests.AsNoTracking().Where(predicate)
            join mj in _db.Media.AsNoTracking() on r.MediaId equals (Guid?)mj.Id into mg
            from m in mg.DefaultIfEmpty()
            join requester in _db.Users.AsNoTracking() on r.RequesterUserId equals requester.Id
            join owner in _db.Users.AsNoTracking() on r.OwnerUserId equals owner.Id
            // Pending first, because those are the rows with work in them; newest next.
            orderby (r.Status == DownloadRequestStatus.Pending ? 0 : 1), r.CreatedAt descending
            select new DownloadRequestDTO
            {
                Id = r.Id,
                MediaId = r.MediaId,
                Kind = r.Kind,
                // Counted live rather than stored on the row: the showreel is whatever the owner
                // has curated at the moment it is downloaded, so a count frozen at request time
                // would disagree with what the zip actually contains.
                ShowreelCount = r.Kind == DownloadRequestKind.Showreel
                    ? _db.Media.Count(sm => sm.UserId == r.OwnerUserId && sm.InShowreel && !sm.IsProfileAsset)
                    : 0,
                FileName = m != null ? m.FileName : null,
                ContentType = m != null ? m.ContentType : null,
                FileSize = m != null ? m.FileSize : 0,
                HasThumbnail = m != null && m.ThumbnailUrl != null,
                // Public identity only. These lists are shown to the other party, so the email
                // address stays out of them — same rule as the public media DTO.
                RequesterName = requester.DisplayName ?? requester.Handle ?? "A viewer",
                RequesterHandle = requester.Handle,
                OwnerName = owner.DisplayName ?? owner.Handle ?? "The owner",
                OwnerHandle = owner.Handle,
                Status = r.Status,
                Message = r.Message,
                CreatedAt = r.CreatedAt,
                DecidedAt = r.DecidedAt,
            };

        return await rows.Take(200).ToListAsync();
    }

    private async Task<DownloadRequestDTO> ToDtoAsync(DownloadRequest request)
        => (await QueryAsync(r => r.Id == request.Id)).First();

    /// <summary>
    /// Emails the owner that someone is waiting on them. Never throws: the request is already
    /// saved and visible on their Requests page, so a mail provider having a bad day must not turn
    /// a successful request into an error for the person who made it.
    /// </summary>
    private async Task NotifyOwnerAsync(DownloadRequest request, Media? media)
    {
        try
        {
            var owner = await _db.Users.AsNoTracking()
                .Where(u => u.Id == request.OwnerUserId)
                .Select(u => new { u.Email, u.DisplayName, u.Handle })
                .FirstOrDefaultAsync();

            var requester = await _db.Users.AsNoTracking()
                .Where(u => u.Id == request.RequesterUserId)
                .Select(u => new { u.DisplayName, u.Handle })
                .FirstOrDefaultAsync();

            if (owner?.Email is null) return;

            await _emailService.SendDownloadRequestAsync(
                owner.Email,
                owner.DisplayName ?? owner.Handle ?? "there",
                requester?.DisplayName ?? requester?.Handle ?? "A viewer",
                // A showreel request has no file behind it, so it is named by what it actually
                // asks for. The owner reading this needs to know it is the whole set, not one item.
                request.Kind == DownloadRequestKind.Showreel
                    ? "your showreel (all of your selected files)"
                    : media?.FileName ?? "one of your files",
                request.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Download request {RequestId} saved, but the owner could not be emailed.", request.Id);
        }
    }

    /// <summary>Tells the requester the answer. Same rule: the decision is saved either way.</summary>
    private async Task NotifyRequesterAsync(DownloadRequest request, bool approved, bool revoked)
    {
        try
        {
            var requester = await _db.Users.AsNoTracking()
                .Where(u => u.Id == request.RequesterUserId)
                .Select(u => new { u.Email, u.DisplayName, u.Handle })
                .FirstOrDefaultAsync();

            var fileName = await _db.Media.AsNoTracking()
                .Where(m => m.Id == request.MediaId)
                .Select(m => m.FileName)
                .FirstOrDefaultAsync();

            if (requester?.Email is null) return;

            await _emailService.SendDownloadRequestDecisionAsync(
                requester.Email,
                requester.DisplayName ?? requester.Handle ?? "there",
                request.Kind == DownloadRequestKind.Showreel
                    ? "the showreel you asked for"
                    : fileName ?? "the file you asked about",
                approved,
                revoked);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Download request {RequestId} decided, but the requester could not be emailed.", request.Id);
        }
    }

    private static string? Trim(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var cleaned = value.Trim();
        return cleaned.Length <= MaxMessageLength ? cleaned : cleaned[..MaxMessageLength];
    }
}
