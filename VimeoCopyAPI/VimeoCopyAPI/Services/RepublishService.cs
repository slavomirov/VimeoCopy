using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

/// <inheritdoc />
public class RepublishService : IRepublishService
{
    private readonly AppDbContext _db;
    private readonly IEmailService _email;
    private readonly IAmazonS3 _s3;
    private readonly string? _bucket;
    private readonly ILogger<RepublishService> _logger;

    /// <summary>Mirrors RepublishRequest.Reason's column width.</summary>
    private const int MaxReasonLength = 1000;

    public RepublishService(
        AppDbContext db,
        IEmailService email,
        IAmazonS3 s3,
        IConfiguration config,
        ILogger<RepublishService> logger)
    {
        _db = db;
        _email = email;
        _s3 = s3;
        _bucket = config["AWS:BucketName"];
        _logger = logger;
    }

    public async Task<RepublishRequestDTO> CreateAsync(string ownerUserId, CreateRepublishRequestDTO dto)
    {
        var reason = (dto.Reason ?? string.Empty).Trim();
        if (reason.Length == 0)
            throw new ValidationException("Tell us why this should go back up.");
        if (reason.Length > MaxReasonLength) reason = reason[..MaxReasonLength];

        var media = await _db.Media.FirstOrDefaultAsync(m => m.Id == dto.MediaId)
            ?? throw new NotFoundException("Media not found.");

        // Ownership is the authority. Without this any signed-in user could appeal anyone's
        // takedown, and an approval would republish a file that was never theirs.
        if (media.UserId != ownerUserId)
            throw new ForbiddenException("That isn't your file.");

        // An owner's own private file needs no appeal — they can publish it themselves. Saying so
        // is better than accepting an appeal that staff would only bounce back.
        if (!media.StaffHidden)
            throw new ValidationException("This file wasn't taken down by us — you can make it public yourself.");

        var live = await _db.RepublishRequests
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.MediaId == media.Id && r.Status == RepublishRequestStatus.Pending);

        // Hand back the open one rather than stacking duplicates in the staff inbox.
        if (live is not null) return await ToDtoAsync(live);

        var request = new RepublishRequest
        {
            MediaId = media.Id,
            OwnerUserId = ownerUserId,
            Reason = reason,
            Status = RepublishRequestStatus.Pending,
            CreatedAt = DateTime.UtcNow,
        };

        _db.RepublishRequests.Add(request);
        await _db.SaveChangesAsync();

        return await ToDtoAsync(request);
    }

    public Task<IEnumerable<RepublishRequestDTO>> GetPendingAsync()
        => QueryAsync(r => r.Status == RepublishRequestStatus.Pending);

    public Task<IEnumerable<RepublishRequestDTO>> GetMineAsync(string ownerUserId)
        => QueryAsync(r => r.OwnerUserId == ownerUserId);

    public Task<int> CountPendingAsync()
        => _db.RepublishRequests.CountAsync(r => r.Status == RepublishRequestStatus.Pending);

    public async Task<RepublishRequestDTO> DecideAsync(
        long requestId, string adminUserId, DecideRepublishRequestDTO dto)
    {
        var request = await _db.RepublishRequests.FirstOrDefaultAsync(r => r.Id == requestId)
            ?? throw new NotFoundException("That request no longer exists.");

        if (request.Status != RepublishRequestStatus.Pending)
            throw new ValidationException("That request has already been answered.");

        var media = await _db.Media.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == request.MediaId);

        var note = Trim(dto.Note, 500);

        request.Status = dto.Approve ? RepublishRequestStatus.Approved : RepublishRequestStatus.Denied;
        request.DecidedAt = DateTime.UtcNow;
        request.DecidedByUserId = adminUserId;
        request.DecisionNote = note;

        if (dto.Approve && media is not null)
        {
            // Clearing StaffHidden is the substance of the approval: it is what hands control of
            // this file's visibility back to its owner. Leaving it set while publishing the file
            // would put it back up and still refuse the owner's own toggle from then on.
            media.IsPublic = true;
            media.ShowOnMediaPage = true;
            media.StaffHidden = false;
            media.StaffHiddenReason = null;
        }

        // The audit log carries takedowns; putting content back is the same kind of act and belongs
        // in the same place, or the record only ever shows half of what staff did.
        _db.AdminAuditLogs.Add(new AdminAuditLog
        {
            ActorUserId = adminUserId,
            ActorEmail = await _db.Users.Where(u => u.Id == adminUserId).Select(u => u.Email).FirstOrDefaultAsync(),
            Action = dto.Approve ? AdminAction.RepublishApprove : AdminAction.RepublishDeny,
            TargetType = "Media",
            TargetId = request.MediaId.ToString(),
            TargetLabel = media?.FileName,
            Detail = (dto.Approve ? "re-published on appeal" : "appeal refused")
                     + (note is null ? "" : " — " + note)
                     + " (owner: " + media?.User?.Email + ")",
            CreatedAt = DateTime.UtcNow,
        });

        await _db.SaveChangesAsync();

        await NotifyOwnerAsync(request, media, dto.Approve, note);

        return await ToDtoAsync(request);
    }

    /* ── Helpers ─────────────────────────────────────────────────────────────────────────────── */

    private async Task<IEnumerable<RepublishRequestDTO>> QueryAsync(
        System.Linq.Expressions.Expression<Func<RepublishRequest, bool>> predicate)
    {
        var rows = await (
            from r in _db.RepublishRequests.AsNoTracking().Where(predicate)
            join m in _db.Media.AsNoTracking() on r.MediaId equals m.Id
            join owner in _db.Users.AsNoTracking() on r.OwnerUserId equals owner.Id
            // Pending first — those are the rows with work in them; oldest next, so nobody's
            // appeal is left at the bottom of the list indefinitely.
            orderby (r.Status == RepublishRequestStatus.Pending ? 0 : 1), r.CreatedAt
            select new
            {
                Row = new RepublishRequestDTO
                {
                    Id = r.Id,
                    MediaId = r.MediaId,
                    FileName = m.FileName,
                    ContentType = m.ContentType,
                    FileSize = m.FileSize,
                    OwnerName = owner.DisplayName ?? owner.Handle ?? "An owner",
                    OwnerHandle = owner.Handle,
                    OwnerEmail = owner.Email,
                    StaffHiddenReason = m.StaffHiddenReason,
                    PendingReports = _db.MediaReports.Count(x => x.MediaId == m.Id && x.Status == "Pending"),
                    Reason = r.Reason,
                    Status = r.Status,
                    CreatedAt = r.CreatedAt,
                    DecidedAt = r.DecidedAt,
                    DecisionNote = r.DecisionNote,
                },
                m.ThumbnailUrl,
            }).Take(200).ToListAsync();

        // Presigning happens after materialising, because GetPreSignedURL is a local signing call
        // that EF cannot translate into the query.
        foreach (var x in rows)
        {
            if (!string.IsNullOrEmpty(x.ThumbnailUrl)) x.Row.ThumbnailUrl = Presign(x.ThumbnailUrl);
        }

        return rows.Select(x => x.Row).ToList();
    }

    private async Task<RepublishRequestDTO> ToDtoAsync(RepublishRequest request)
        => (await QueryAsync(r => r.Id == request.Id)).First();

    /// <summary>
    /// Tells the owner what was decided. Never throws: the decision is already committed and the
    /// file is already back up (or still down), so a mail provider having a bad day must not turn
    /// a completed decision into an error that invites staff to click again.
    /// </summary>
    private async Task NotifyOwnerAsync(
        RepublishRequest request, VimeoCopyApi.Models.Media? media, bool approved, string? note)
    {
        try
        {
            var owner = await _db.Users.AsNoTracking()
                .Where(u => u.Id == request.OwnerUserId)
                .Select(u => new { u.Email, u.DisplayName, u.Handle })
                .FirstOrDefaultAsync();

            if (owner?.Email is null) return;

            await _email.SendRepublishDecisionAsync(
                owner.Email,
                owner.DisplayName ?? owner.Handle ?? "there",
                string.IsNullOrWhiteSpace(media?.FileName) ? "your file" : media!.FileName!,
                approved,
                note);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Re-publish request {RequestId} decided, but the owner could not be emailed.", request.Id);
        }
    }

    private string Presign(string key)
        => _s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = _bucket,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15),
        });

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
