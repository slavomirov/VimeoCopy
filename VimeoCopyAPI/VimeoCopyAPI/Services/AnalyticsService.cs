using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class AnalyticsService : IAnalyticsService
{
    private readonly AppDbContext _db;

    public AnalyticsService(AppDbContext db) => _db = db;

    /// <summary>Log retention caps how far back any of this can honestly look.</summary>
    public const int MaxWindowDays = 90;
    public const int DefaultWindowDays = 30;

    public async Task<AudienceOverviewDTO> GetAudienceOverviewAsync(string ownerUserId, int days = DefaultWindowDays)
    {
        days = Math.Clamp(days, 1, MaxWindowDays);
        var since = DateTime.UtcNow.Date.AddDays(-(days - 1));

        // Every figure below shares this window. The totals used to be all-time while the chart was
        // 30 days, so the headline numbers and the graph beneath them described different periods —
        // and "all-time" silently shrank anyway as logs aged past the 90-day purge.
        var logs = _db.BandwidthLogs.AsNoTracking()
            .Where(b => b.OwnerUserId == ownerUserId && b.CreatedAt >= since);

        var totalViews = await logs.LongCountAsync();
        var totalBytes = await logs.SumAsync(b => (long?)b.Bytes) ?? 0;
        var uniqueViewers = await logs.Select(b => b.ViewerUserId ?? b.ViewerIpHash).Distinct().CountAsync();

        // Views per day (gaps filled to 0 for a clean chart).
        var dailyRaw = await logs
            .GroupBy(b => b.CreatedAt.Date)
            .Select(g => new { Day = g.Key, Views = g.Count() })
            .ToListAsync();

        var dailyMap = dailyRaw.ToDictionary(x => x.Day, x => x.Views);
        var viewsByDay = Enumerable.Range(0, days)
            .Select(i => since.AddDays(i))
            .Select(d => new DailyViewsDTO { Date = d.ToString("yyyy-MM-dd"), Views = dailyMap.GetValueOrDefault(d, 0) })
            .ToList();

        // Top media by views.
        var topRaw = await logs
            .GroupBy(b => b.MediaId)
            .Select(g => new
            {
                MediaId = g.Key,
                Views = g.Count(),
                Unique = g.Select(x => x.ViewerUserId ?? x.ViewerIpHash).Distinct().Count(),
            })
            .OrderByDescending(x => x.Views)
            .Take(10)
            .ToListAsync();

        var ids = topRaw.Select(t => t.MediaId).ToList();
        var names = await _db.Media.AsNoTracking()
            .Where(m => ids.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.FileName);

        var topMedia = topRaw.Select(t => new TopMediaDTO
        {
            MediaId = t.MediaId,
            FileName = names.GetValueOrDefault(t.MediaId),
            Views = t.Views,
            UniqueViewers = t.Unique,
        }).ToList();

        // Views by traffic source.
        var bySource = (await logs
            .GroupBy(b => b.Source)
            .Select(g => new { g.Key, Views = g.Count() })
            .ToListAsync())
            .Select(x => new SourceBreakdownDTO { Source = x.Key.ToString(), Views = x.Views })
            .OrderByDescending(x => x.Views)
            .ToList();

        return new AudienceOverviewDTO
        {
            TotalViews = totalViews,
            UniqueViewers = uniqueViewers,
            TotalBytes = totalBytes,
            WindowDays = days,
            ViewsByDay = viewsByDay,
            TopMedia = topMedia,
            BySource = bySource,
        };
    }
}
