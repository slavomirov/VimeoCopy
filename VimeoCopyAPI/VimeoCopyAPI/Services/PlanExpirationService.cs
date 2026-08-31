using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

/// <summary>
/// Warns users before their plan lapses and, after a grace period, reclaims their storage.
///
/// Three rules keep this honest, and all three were learned the hard way:
///   • Each user is processed and saved independently — one undeliverable address must not stop
///     the whole batch, which is what froze this service entirely.
///   • State is committed BEFORE the email is sent, and delivery is best-effort. A notification
///     that can't be sent must never block the action it describes.
///   • Notification bookkeeping is scoped to the plan period it belongs to, so a row written for
///     one plan can't suppress the warning for the next one.
/// </summary>
public class PlanExpirationService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<PlanExpirationService> _logger;
    private readonly TimeSpan _checkInterval = TimeSpan.FromHours(24);

    /// <summary>How long after expiry the media is kept before deletion.</summary>
    private static readonly TimeSpan GracePeriod = TimeSpan.FromDays(3);

    public PlanExpirationService(IServiceProvider serviceProvider, ILogger<PlanExpirationService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Plan expiration service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckPlanExpirationsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in plan expiration check");
            }

            await Task.Delay(_checkInterval, stoppingToken);
        }

        _logger.LogInformation("Plan expiration service stopped");
    }

    private async Task CheckPlanExpirationsAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
        var s3 = scope.ServiceProvider.GetRequiredService<IAmazonS3>();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var bucket = config["AWS:BucketName"];

        var now = DateTime.UtcNow;

        // Only users who need attention: expiring within a day, or already expired.
        var dueUserIds = await db.Users
            .Where(u => u.PlanId != null && u.PlanExpiration != null && u.PlanExpiration <= now.AddDays(1))
            .Select(u => u.Id)
            .ToListAsync(ct);

        var processed = 0;

        foreach (var userId in dueUserIds)
        {
            if (ct.IsCancellationRequested) break;

            try
            {
                await ProcessUserAsync(db, emailService, s3, bucket, userId, now, ct);
                processed++;
            }
            catch (Exception ex)
            {
                // Isolated on purpose: this user is retried on the next run, everyone else proceeds.
                _logger.LogError(ex, "Plan expiration handling failed for user {UserId}", userId);
                db.ChangeTracker.Clear();
            }
        }

        _logger.LogInformation("Plan expiration check completed ({Processed}/{Total} users)", processed, dueUserIds.Count);
    }

    private async Task ProcessUserAsync(
        AppDbContext db, IEmailService emailService, IAmazonS3 s3, string? bucket,
        string userId, DateTime now, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user?.PlanExpiration is null || user.PlanId is null) return;

        var expiration = user.PlanExpiration.Value;
        var displayName = DisplayNameFor(user);

        // Still in the final day before expiry — one warning per plan period.
        if (expiration > now)
        {
            if (await AlreadySentAsync(db, userId, NotificationType.ExpiringIn1Day, expiration, ct)) return;

            await RecordAsync(db, userId, NotificationType.ExpiringIn1Day, expiration, ct);
            await TrySendAsync(() => emailService.SendPlanExpiringIn1DayAsync(user.Email!, displayName), userId);
            return;
        }

        // Expired, still inside the grace period — one final notice per plan period.
        if (now - expiration < GracePeriod)
        {
            if (await AlreadySentAsync(db, userId, NotificationType.ExpiringIn3Days, expiration, ct)) return;

            await RecordAsync(db, userId, NotificationType.ExpiringIn3Days, expiration, ct);
            await TrySendAsync(() => emailService.SendPlanExpiringIn3DaysAsync(user.Email!, displayName), userId);
            return;
        }

        // Grace period is over: reclaim the storage.
        if (await AlreadySentAsync(db, userId, NotificationType.Expired, expiration, ct)) return;

        _logger.LogInformation("Deleting media for user {UserId} (plan expired {Days} days ago)",
            userId, (now - expiration).Days);

        // Objects before rows. The rows are the only record of which keys exist, so deleting them
        // first would strand every file in the bucket — paid for, invisible, unrecoverable.
        await DeleteUserStorageAsync(db, s3, bucket, userId, ct);

        user.PlanId = null;
        user.BuyedMemory = null;
        user.UsedMemory = 0;
        user.BuyedBandwidth = null;
        user.UsedBandwidth = null;
        user.PlanExpiration = null;
        user.BandwidthCycleStart = null;
        user.BandwidthOverageNotifiedAt = null;

        await RecordAsync(db, userId, NotificationType.Expired, expiration, ct);
        await TrySendAsync(() => emailService.SendPlanExpiredAsync(user.Email!, displayName), userId);
    }

    private async Task DeleteUserStorageAsync(
        AppDbContext db, IAmazonS3 s3, string? bucket, string userId, CancellationToken ct)
    {
        var media = await db.Media
            .Where(m => m.UserId == userId)
            .Select(m => new { m.Id, m.ThumbnailUrl })
            .ToListAsync(ct);

        foreach (var m in media)
        {
            try { await s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = bucket, Key = m.Id.ToString() }, ct); }
            catch (Exception ex) { _logger.LogWarning(ex, "Could not delete object {Key}", m.Id); }

            if (!string.IsNullOrEmpty(m.ThumbnailUrl))
            {
                try { await s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = bucket, Key = m.ThumbnailUrl }, ct); }
                catch { /* best-effort; the maintenance sweep will catch stragglers */ }
            }
        }

        // ProjectMedias references Media with NoAction (deliberately, to avoid a cascade cycle), so
        // the join rows have to go first or the delete fails on the FK constraint. The old code
        // never reached this point — an email exception aborted the run before it could.
        var mediaIds = media.Select(m => m.Id).ToList();
        await db.ProjectMedias.Where(pm => mediaIds.Contains(pm.MediaId)).ExecuteDeleteAsync(ct);

        // A project thumbnail pointing at a deleted work would dangle.
        await db.Projects
            .Where(p => p.UserId == userId && p.ThumbnailMediaId != null && mediaIds.Contains(p.ThumbnailMediaId!.Value))
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ThumbnailMediaId, (Guid?)null), ct);

        await db.Media.Where(m => m.UserId == userId).ExecuteDeleteAsync(ct);
    }

    /// <summary>
    /// Has this exact notification already gone out for this exact plan period? The
    /// ExpirationCheckDate match is what stops a row written for an old plan from suppressing the
    /// warning forever — without it, a user is warned once in the lifetime of their account.
    /// </summary>
    private static Task<bool> AlreadySentAsync(
        AppDbContext db, string userId, NotificationType type, DateTime expiration, CancellationToken ct)
        => db.PlanNotifications.AnyAsync(
            pn => pn.UserId == userId && pn.Type == type && pn.ExpirationCheckDate == expiration, ct);

    private static async Task RecordAsync(
        AppDbContext db, string userId, NotificationType type, DateTime expiration, CancellationToken ct)
    {
        db.PlanNotifications.Add(new PlanNotification
        {
            UserId = userId,
            Type = type,
            ExpirationCheckDate = expiration,
        });

        // Committed before the email goes out, so a delivery failure can't roll back the decision.
        await db.SaveChangesAsync(ct);
    }

    private async Task TrySendAsync(Func<Task> send, string userId)
    {
        try
        {
            await send();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not deliver plan email to user {UserId}", userId);
        }
    }

    /// <summary>UserName is the email address here, so greet people by something they'd recognise.</summary>
    private static string DisplayNameFor(ApplicationUser user)
        => !string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName!
         : !string.IsNullOrWhiteSpace(user.Handle) ? user.Handle!
         : "there";
}
