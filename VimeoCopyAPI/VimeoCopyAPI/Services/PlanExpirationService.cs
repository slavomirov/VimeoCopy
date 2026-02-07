using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class PlanExpirationService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<PlanExpirationService> _logger;
    private readonly TimeSpan _checkInterval = TimeSpan.FromHours(24);

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
                _logger.LogError($"Error in plan expiration check: {ex.Message}");
            }

            await Task.Delay(_checkInterval, stoppingToken);
        }

        _logger.LogInformation("Plan expiration service stopped");
    }

    private async Task CheckPlanExpirationsAsync(CancellationToken stoppingToken)
    {
        using (var scope = _serviceProvider.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();

            var now = DateTime.UtcNow;
            var tomorrow = now.AddDays(1);
            var threeOrMoreDaysAgo = now.AddDays(-3);

            var usersWithPlans = await dbContext.Users
                .Include(u => u.Plan)
                .Where(u => u.PlanId != null && u.PlanExpiration != null)
                .ToListAsync(stoppingToken);

            foreach (var user in usersWithPlans)
            {
                var planExpiration = user.PlanExpiration!.Value;

                // Case 1: Plan expires in the next day
                if (planExpiration > now && planExpiration <= tomorrow)
                {
                    var existingNotification = await dbContext.PlanNotifications
                        .FirstOrDefaultAsync(pn => pn.UserId == user.Id && pn.Type == NotificationType.ExpiringIn1Day,
                            stoppingToken);

                    if (existingNotification == null)
                    {
                        await emailService.SendPlanExpiringIn1DayAsync(user.Email!, user.UserName!);
                        dbContext.PlanNotifications.Add(new PlanNotification
                        {
                            UserId = user.Id,
                            Type = NotificationType.ExpiringIn1Day,
                            ExpirationCheckDate = planExpiration
                        });
                    }
                }
                // Case 2: Plan already expired
                else if (planExpiration <= now)
                {
                    // Check if already notified about expiration
                    var expiredNotification = await dbContext.PlanNotifications
                        .FirstOrDefaultAsync(pn => pn.UserId == user.Id && pn.Type == NotificationType.Expired,
                            stoppingToken);

                    if (expiredNotification == null)
                    {
                        // Case 2a: Plan expired 3+ days ago - delete media and plan
                        if (planExpiration <= threeOrMoreDaysAgo)
                        {
                            _logger.LogInformation($"Deleting all media and plan for user {user.Id} (plan expired {(now - planExpiration).Days} days ago)");

                            await DeleteUserMediaAsync(dbContext, user.Id);
                            user.PlanId = null;
                            user.BuyedMemory = null;
                            user.UsedMemory = 0;

                            dbContext.PlanNotifications.Add(new PlanNotification
                            {
                                UserId = user.Id,
                                Type = NotificationType.Expired,
                                ExpirationCheckDate = planExpiration
                            });

                            await emailService.SendPlanExpiredAsync(user.Email!, user.UserName!);
                        }
                        // Case 2b: Plan expired but less than 3 days - send final notice
                        else if (planExpiration <= now)
                        {
                            await emailService.SendPlanExpiringIn3DaysAsync(user.Email!, user.UserName!);

                            dbContext.PlanNotifications.Add(new PlanNotification
                            {
                                UserId = user.Id,
                                Type = NotificationType.ExpiringIn3Days,
                                ExpirationCheckDate = planExpiration
                            });
                        }
                    }
                }
            }

            await dbContext.SaveChangesAsync(stoppingToken);
            _logger.LogInformation("Plan expiration check completed");
        }
    }

    private async Task DeleteUserMediaAsync(AppDbContext dbContext, string userId)
    {
        var userMedia = await dbContext.Media
            .Where(m => m.UserId == userId)
            .ToListAsync();

        dbContext.Media.RemoveRange(userMedia);
    }
}
