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

    /// <summary>
    /// Tells an owner that someone has asked to download one of their files. The requester's note
    /// is attacker-controlled text, so it is encoded rather than interpolated.
    /// </summary>
    Task SendDownloadRequestAsync(string ownerEmail, string ownerName, string requesterName, string fileName, string? message);

    /// <summary>
    /// Tells the requester what the owner decided. `revoked` distinguishes access being taken back
    /// from a request being declined in the first place — the same status, but not the same news.
    /// </summary>
    Task SendDownloadRequestDecisionAsync(string requesterEmail, string requesterName, string fileName, bool approved, bool revoked = false);

    /// <summary>
    /// Tells an owner that staff made one of their files private. The reason is staff-written free
    /// text, so it is encoded rather than interpolated, like every other body here.
    /// </summary>
    Task SendMediaHiddenAsync(string ownerEmail, string ownerName, string fileName, string? reason);

    /// <summary>The other half of the pair — a file that was hidden is visible again.</summary>
    Task SendMediaRestoredAsync(string ownerEmail, string ownerName, string fileName);

    /// <summary>
    /// Tells a former owner their file is gone for good. Sent after the delete has succeeded, never
    /// before: a mail promising a deletion that then failed is worse than no mail.
    /// </summary>
    Task SendMediaDeletedAsync(string ownerEmail, string ownerName, string fileName, string? reason);
}
