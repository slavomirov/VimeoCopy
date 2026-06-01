using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class AnalyticsService : IAnalyticsService
{
    private readonly AppDbContext _db;

    public AnalyticsService(AppDbContext db) => _db = db;

    public async Task<AudienceOverviewDTO> GetAudienceOverviewAsync(string ownerUserId)
    {
        // Each BandwidthLog row is one metered, de-duped view (owner's own views are never logged).
        var logs = _db.BandwidthLogs.AsNoTracking().Where(b => b.OwnerUserId == ownerUserId);

        var totalViews = await logs.LongCountAsync();
        var totalBytes = await logs.SumAsync(b => (long?)b.Bytes) ?? 0;
        var uniqueViewers = await logs.Select(b => b.ViewerUserId ?? b.ViewerIpHash).Distinct().CountAsync();

        // Views per day for the last 30 days (gaps filled to 0 for a clean chart).
        var since = DateTime.UtcNow.Date.AddDays(-29);
        var dailyRaw = await logs
            .Where(b => b.CreatedAt >= since)
            .GroupBy(b => b.CreatedAt.Date)
            .Select(g => new { Day = g.Key, Views = g.Count() })
            .ToListAsync();

        var dailyMap = dailyRaw.ToDictionary(x => x.Day, x => x.Views);
        var viewsByDay = Enumerable.Range(0, 30)
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
            ViewsByDay = viewsByDay,
            TopMedia = topMedia,
            BySource = bySource,
        };
    }
}
