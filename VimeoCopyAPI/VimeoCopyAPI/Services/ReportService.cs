using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class ReportService : IReportService
{
    private readonly AppDbContext _db;

    private static readonly HashSet<string> AllowedReasons =
        new(StringComparer.OrdinalIgnoreCase) { "copyright", "explicit", "violence", "spam", "other" };

    public ReportService(AppDbContext db) => _db = db;

    public async Task CreateAsync(ReportCreateDTO dto, string? reporterUserId)
    {
        var reason = (dto.Reason ?? "other").Trim().ToLowerInvariant();
        if (!AllowedReasons.Contains(reason)) reason = "other";

        var exists = await _db.Media.AnyAsync(m => m.Id == dto.MediaId);
        if (!exists) throw new Exception("Media not found.");

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
        return await _db.MediaReports.AsNoTracking()
            .Where(r => r.Status == "Pending")
            .OrderBy(r => r.CreatedAt)
            .Join(_db.Media, r => r.MediaId, m => m.Id, (r, m) => new { r, m })
            .Select(x => new ReportDTO
            {
                Id = x.r.Id,
                MediaId = x.r.MediaId,
                FileName = x.m.FileName,
                Reason = x.r.Reason,
                Details = x.r.Details,
                Status = x.r.Status,
                CreatedAt = x.r.CreatedAt,
                MediaIsPublic = x.m.IsPublic,
                OwnerEmail = x.m.User.Email,
            })
            .ToListAsync();
    }

    public async Task ResolveAsync(long reportId, string action, string reviewerUserId)
    {
        var report = await _db.MediaReports.FirstOrDefaultAsync(r => r.Id == reportId)
            ?? throw new Exception("Report not found.");

        if (string.Equals(action, "remove", StringComparison.OrdinalIgnoreCase))
        {
            // Hide the media rather than hard-deleting (reversible, preserves the owner's file).
            var media = await _db.Media.FirstOrDefaultAsync(m => m.Id == report.MediaId);
            if (media != null)
            {
                media.IsPublic = false;
                media.ShowOnMediaPage = false;
            }
            report.Status = "Removed";
        }
        else
        {
            report.Status = "Dismissed";
        }

        report.ReviewedAt = DateTime.UtcNow;
        report.ReviewedByUserId = reviewerUserId;
        await _db.SaveChangesAsync();
    }
}
