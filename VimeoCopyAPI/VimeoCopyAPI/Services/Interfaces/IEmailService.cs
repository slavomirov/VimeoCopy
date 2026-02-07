namespace VimeoCopyAPI.Services.Interfaces;

public interface IEmailService
{
    Task SendPlanExpiringIn1DayAsync(string email, string userName);
    Task SendPlanExpiringIn3DaysAsync(string email, string userName);
    Task SendPlanExpiredAsync(string email, string userName);
}
