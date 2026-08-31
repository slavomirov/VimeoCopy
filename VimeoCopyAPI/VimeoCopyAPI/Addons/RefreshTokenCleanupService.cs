using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;

namespace VimeoCopyAPI.Addons;

public class RefreshTokenCleanupService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<RefreshTokenCleanupService> _logger;

    public RefreshTokenCleanupService(IServiceProvider serviceProvider, ILogger<RefreshTokenCleanupService> logger)
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

                var deleted = await db.RefreshTokens
                    .Where(t => t.ExpiresAt < DateTime.UtcNow)
                    .ExecuteDeleteAsync(stoppingToken);

                _logger.LogInformation($"Deleted {deleted} expired refresh tokens");

                // Password reset challenges are dead once consumed or once the ticket window has
                // closed; keep a day of history for troubleshooting, then drop them.
                var cutoff = DateTime.UtcNow.AddDays(-1);
                var deletedCodes = await db.PasswordResetCodes
                    .Where(c => c.CreatedAt < cutoff)
                    .ExecuteDeleteAsync(stoppingToken);

                _logger.LogInformation($"Deleted {deletedCodes} stale password reset codes");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while cleaning expired refresh tokens");
            }

            await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
        }
    }
}
