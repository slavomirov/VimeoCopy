using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;

namespace VimeoCopyAPI.Addons;

/// <summary>
/// Daily housekeeping for storage & bandwidth:
///  • purges BandwidthLogs older than the retention window (GDPR — they hold hashed viewer IPs),
///  • reconciles each user's UsedMemory against the actual sum of their media (self-heals drift).
/// </summary>
public class StorageBandwidthMaintenanceService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<StorageBandwidthMaintenanceService> _logger;

    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    private static readonly TimeSpan LogRetention = TimeSpan.FromDays(90);

    public StorageBandwidthMaintenanceService(IServiceProvider serviceProvider, ILogger<StorageBandwidthMaintenanceService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                await PurgeOldBandwidthLogsAsync(db, stoppingToken);
                await ReconcileUsedMemoryAsync(db, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Storage/bandwidth maintenance run failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task PurgeOldBandwidthLogsAsync(AppDbContext db, CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow - LogRetention;
        var deleted = await db.BandwidthLogs.Where(b => b.CreatedAt < cutoff).ExecuteDeleteAsync(ct);
        if (deleted > 0)
            _logger.LogInformation($"Purged {deleted} bandwidth log rows older than {LogRetention.TotalDays} days");
    }

    private async Task ReconcileUsedMemoryAsync(AppDbContext db, CancellationToken ct)
    {
        // Actual bytes stored per user.
        var sums = await db.Media
            .GroupBy(m => m.UserId)
            .Select(g => new { UserId = g.Key, Total = g.Sum(m => m.FileSize) })
            .ToDictionaryAsync(x => x.UserId, x => x.Total, ct);

        var userIds = await db.Users.Select(u => u.Id).ToListAsync(ct);

        var corrected = 0;
        foreach (var id in userIds)
        {
            var total = sums.GetValueOrDefault(id, 0);
            var changed = await db.Users
                .Where(u => u.Id == id && (u.UsedMemory ?? 0) != total)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.UsedMemory, total), ct);
            corrected += changed;
        }

        if (corrected > 0)
            _logger.LogInformation($"Reconciled UsedMemory for {corrected} user(s)");
    }
}
