using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class ReportService : IReportService
{
    private readonly AppDbContext _db;
    private readonly IMediaService _media;
    private readonly IEmailService _email;
    private readonly ILogger<ReportService> _logger;

    private static readonly HashSet<string> AllowedReasons =
        new(StringComparer.OrdinalIgnoreCase) { "copyright", "explicit", "violence", "spam", "other" };

    public ReportService(
        AppDbContext db, IMediaService media, IEmailService email, ILogger<ReportService> logger)
    {
        _db = db;
        _media = media;
        _email = email;
        _logger = logger;
    }

    public async Task CreateAsync(ReportCreateDTO dto, string? reporterUserId)
    {
        var reason = (dto.Reason ?? "other").Trim().ToLowerInvariant();
        if (!AllowedReasons.Contains(reason)) reason = "other";

        var exists = await _db.Media.AnyAsync(m => m.Id == dto.MediaId);
        if (!exists) throw new NotFoundException("Media not found.");

        // Collapse duplicate pending reports from the same reporter for the same media.
        if (reporterUserId != null)
        {
            var dupe = await _db.MediaReports.AnyAsync(r =>
                r.MediaId == dto.MediaId && r.ReporterUserId == reporterUserId && r.Status == "Pending");
            if (dupe) return;
        }

        _db.MediaReports.Add(new MediaReport
        {
            MediaId = dto.MediaId,
            ReporterUserId = reporterUserId,
            Reason = reason,
            Details = string.IsNullOrWhiteSpace(dto.Details) ? null
                : dto.Details.Trim()[..Math.Min(dto.Details.Trim().Length, 1000)],
            Status = "Pending",
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<ReportDTO>> GetPendingAsync()
    {
        // The reporter join is a LEFT join: ReporterUserId is null for an anonymous report, and an
        // inner join would silently drop exactly the reports nobody put their name to.
        var rows =
            from r in _db.MediaReports.AsNoTracking().Where(r => r.Status == "Pending")
            join m in _db.Media.AsNoTracking() on r.MediaId equals m.Id
            join rep in _db.Users.AsNoTracking() on r.ReporterUserId equals rep.Id into reps
            from reporter in reps.DefaultIfEmpty()
            orderby r.CreatedAt
            select new ReportDTO
            {
                Id = r.Id,
                MediaId = r.MediaId,
                FileName = m.FileName,
                Reason = r.Reason,
                Details = r.Details,
                Status = r.Status,
                CreatedAt = r.CreatedAt,
                MediaIsPublic = m.IsPublic,
                OwnerEmail = m.User.Email,
                ReporterName = reporter != null ? (reporter.DisplayName ?? reporter.Handle) : null,
                ReporterHandle = reporter != null ? reporter.Handle : null,
                ReporterEmail = reporter != null ? reporter.Email : null,
                ReporterTotalReports = reporter != null
                    ? _db.MediaReports.Count(x => x.ReporterUserId == reporter.Id)
                    : 0,
            };

        return await rows.ToListAsync();
    }

    public async Task ResolveAsync(long reportId, string action, string reviewerUserId, string? reason = null)
    {
        var report = await _db.MediaReports.FirstOrDefaultAsync(r => r.Id == reportId)
            ?? throw new NotFoundException("Report not found.");

        var isRemove = string.Equals(action, "remove", StringComparison.OrdinalIgnoreCase);
        var isDelete = string.Equals(action, "delete", StringComparison.OrdinalIgnoreCase);

        // Loaded with the owner attached, because both outcomes have to mail them and one of them
        // destroys the row that holds the address.
        var media = isRemove || isDelete
            ? await _db.Media.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == report.MediaId)
            : null;

        var ownerEmail = media?.User?.Email;
        var ownerName = media?.User is null ? "there" : DisplayNameFor(media.User);
        var fileLabel = media is null || string.IsNullOrWhiteSpace(media.FileName)
            ? "an untitled file"
            : media.FileName!;

        var wasHidden = media is not null && !media.IsPublic;

        if (isRemove)
        {
            // Hide the media rather than hard-deleting (reversible, preserves the owner's file).
            if (media != null)
            {
                media.IsPublic = false;
                media.ShowOnMediaPage = false;
                // Same flag the admin media tab sets: this is a staff takedown, so the owner's
                // visibility toggle refuses until an appeal is approved.
                media.StaffHidden = true;
                media.StaffHiddenReason = reason?.Trim() is { Length: > 0 } r
                    ? r[..Math.Min(r.Length, 500)]
                    : "Removed after a report.";
            }
            report.Status = "Removed";
        }
        else if (isDelete)
        {
            report.Status = "Deleted";
        }
        else
        {
            report.Status = "Dismissed";
        }

        report.ReviewedAt = DateTime.UtcNow;
        report.ReviewedByUserId = reviewerUserId;
        await _db.SaveChangesAsync();

        // The destructive step runs after the report is closed, and it deletes this report's own row
        // along with every other one against the file — which is why the status above is written and
        // committed first, and why nothing below touches `report` again.
        if (isDelete && media is not null)
            await _media.DeleteMediaAsAdminAsync(media.Id.ToString());

        if (string.IsNullOrWhiteSpace(ownerEmail)) return;

        // A failed mail must not fail a moderation decision that is already committed — the caller
        // would retry and hide or delete twice. Logged instead.
        try
        {
            if (isDelete)
                await _email.SendMediaDeletedAsync(ownerEmail, ownerName, fileLabel, reason);
            else if (isRemove && !wasHidden)
                await _email.SendMediaHiddenAsync(ownerEmail, ownerName, fileLabel, reason);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not email the owner about report {ReportId}.", reportId);
        }
    }

    /// <summary>UserName is the email address here, so greet people by something they'd recognise.</summary>
    private static string DisplayNameFor(ApplicationUser user)
        => !string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName!
         : !string.IsNullOrWhiteSpace(user.Handle) ? user.Handle!
         : "there";
}
