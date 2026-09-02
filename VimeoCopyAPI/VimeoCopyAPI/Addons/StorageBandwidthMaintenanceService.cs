using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;

namespace VimeoCopyAPI.Addons;

/// <summary>
/// Daily housekeeping for storage &amp; bandwidth:
///  • purges BandwidthLogs older than the retention window (GDPR — they hold hashed viewer IPs),
///  • reconciles each user's UsedMemory against the actual sum of their media (self-heals drift),
///  • sweeps orphaned objects out of the bucket.
///
/// The sweep matters most. A presigned PUT writes to storage immediately while the Media row is
/// only created at confirm time, so every abandoned or rejected upload leaves an object that no
/// query can find. Reconciling against Media rows alone actively hides them: it lowers the user's
/// recorded usage while the bytes stay on the invoice.
/// </summary>
public class StorageBandwidthMaintenanceService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<StorageBandwidthMaintenanceService> _logger;

    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    private static readonly TimeSpan LogRetention = TimeSpan.FromDays(90);

    /// <summary>
    /// Extra slack beyond a pending upload's expiry before its key is considered abandoned, so a
    /// confirm that lands moments after the presign window can't have its object deleted underneath it.
    /// </summary>
    private static readonly TimeSpan SweepGrace = TimeSpan.FromHours(6);

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
                var s3 = scope.ServiceProvider.GetRequiredService<IAmazonS3>();
                var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();

                await PurgeOldBandwidthLogsAsync(db, stoppingToken);
                await PurgeExpiredPendingUploadsAsync(db, stoppingToken);
                await SweepOrphanedObjectsAsync(db, s3, config["AWS:BucketName"], stoppingToken);
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
            _logger.LogInformation("Purged {Count} bandwidth log rows older than {Days} days", deleted, LogRetention.TotalDays);
    }

    /// <summary>Drops pending rows whose window closed long ago; their keys are swept separately.</summary>
    private async Task PurgeExpiredPendingUploadsAsync(AppDbContext db, CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow - TimeSpan.FromDays(7);
        var deleted = await db.PendingUploads.Where(p => p.ExpiresAt < cutoff).ExecuteDeleteAsync(ct);
        if (deleted > 0)
            _logger.LogInformation("Removed {Count} stale pending-upload records", deleted);
    }

    /// <summary>
    /// Deletes bucket objects that no longer correspond to anything: no Media row, no thumbnail
    /// owner, and no pending upload still inside its window.
    /// </summary>
    private async Task SweepOrphanedObjectsAsync(AppDbContext db, IAmazonS3 s3, string? bucket, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(bucket)) return;

        var knownMedia = (await db.Media.Select(m => m.Id).ToListAsync(ct))
            .Select(id => id.ToString())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var knownThumbs = (await db.Media
                .Where(m => m.ThumbnailUrl != null)
                .Select(m => m.ThumbnailUrl!)
                .ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        // Anything still in flight is off limits, plus a grace margin.
        var protectedUntil = DateTime.UtcNow - SweepGrace;
        var pending = (await db.PendingUploads
                .Where(p => p.ExpiresAt > protectedUntil)
                .Select(p => p.Id)
                .ToListAsync(ct))
            .Select(id => id.ToString())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var deleted = 0;
        string? continuationToken = null;

        do
        {
            ListObjectsV2Response page;
            try
            {
                page = await s3.ListObjectsV2Async(new ListObjectsV2Request
                {
                    BucketName = bucket,
                    ContinuationToken = continuationToken,
                    MaxKeys = 1000,
                }, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Could not list bucket contents; skipping orphan sweep this run");
                return;
            }

            // AWS SDK v4 leaves response collections NULL when the service returns no elements —
            // v3.7 always handed back an empty list. An empty bucket (or a page with no keys) would
            // otherwise NRE right here and take the whole maintenance loop down on startup.
            foreach (var obj in page.S3Objects ?? [])
            {
                if (ct.IsCancellationRequested) return;

                // Never touch an object written in the last few hours: it may belong to an upload
                // whose pending row hasn't been read yet, or to a flow we don't model here.
                // A null LastModified means we can't prove the object is old — leave it alone.
                if (obj.LastModified is null || obj.LastModified.Value.ToUniversalTime() > protectedUntil) continue;

                if (IsReferenced(obj.Key, knownMedia, knownThumbs, pending)) continue;

                try
                {
                    await s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = bucket, Key = obj.Key }, ct);
                    deleted++;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not delete orphaned object {Key}", obj.Key);
                }
            }

            continuationToken = page.IsTruncated == true ? page.NextContinuationToken : null;
        }
        while (continuationToken != null);

        if (deleted > 0)
            _logger.LogInformation("Swept {Count} orphaned objects from storage", deleted);
    }

    private static bool IsReferenced(string key, HashSet<string> media, HashSet<string> thumbs, HashSet<string> pending)
    {
        if (media.Contains(key) || thumbs.Contains(key) || pending.Contains(key)) return true;

        // A thumbnail key is thumb_<mediaId>; keep it while its media or pending upload survives.
        if (key.StartsWith("thumb_", StringComparison.OrdinalIgnoreCase))
        {
            var ownerId = key[6..];
            return media.Contains(ownerId) || pending.Contains(ownerId);
        }

        return false;
    }

    private async Task ReconcileUsedMemoryAsync(AppDbContext db, CancellationToken ct)
    {
        // One set-based pass. This used to issue an individual UPDATE per user, every day.
        var corrected = await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE u
            SET u.UsedMemory = ISNULL(s.Total, 0)
            FROM AspNetUsers u
            LEFT JOIN (
                SELECT UserId, SUM(FileSize) + SUM(ISNULL(ThumbnailSize, 0)) AS Total
                FROM Media
                GROUP BY UserId
            ) s ON s.UserId = u.Id
            WHERE ISNULL(u.UsedMemory, 0) <> ISNULL(s.Total, 0)
            """, ct);

        if (corrected > 0)
            _logger.LogInformation("Reconciled UsedMemory for {Count} user(s)", corrected);
    }
}
