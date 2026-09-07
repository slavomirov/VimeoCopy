namespace VimeoCopyAPI.Services.Interfaces;

public interface IEmailService
{
    Task SendPlanExpiringIn1DayAsync(string email, string userName);
    Task SendPlanExpiringIn3DaysAsync(string email, string userName);
    Task SendPlanExpiredAsync(string email, string userName);
    Task SendBandwidthExceededAsync(string email, string userName);
    Task SendPasswordResetCodeAsync(string email, string userName, string code, int minutesValid);

    /// <summary>
    /// Forwards a contact-form message to the site owners. The recipient comes from configuration
    /// (ContactUs:Recipient) — never from the request — and the sender's address is set as Reply-To
    /// so answering the mail reaches them.
    /// </summary>
    Task SendContactMessageAsync(string senderName, string senderEmail, string subject, string message);
}
