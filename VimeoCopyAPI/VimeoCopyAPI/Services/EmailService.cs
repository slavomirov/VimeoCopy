using VimeoCopyAPI.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace VimeoCopyAPI.Services
{
    public class EmailService : IEmailService
    {
        private readonly IConfiguration _config;
        private readonly ILogger<EmailService> _logger;
        private readonly string _emailProvider;
        private readonly string _fromEmail;
        private readonly string _fromName;
        private readonly string _frontendOrigin;

        public EmailService(IConfiguration config, ILogger<EmailService> logger)
        {
            _config = config;
            _logger = logger;
            _emailProvider = _config["Email:Provider"] ?? "Resend";
            _fromEmail = _config["Email:FromEmail"] ?? "onboarding@resend.dev";
            _fromName = _config["Email:FromName"] ?? "Ferry";

            // Links in these mails used to point at a hard-coded vimeocopy.com, a domain that
            // isn't ours — every "renew your plan" button led nowhere. Same source of truth as
            // the Stripe checkout redirect.
            _frontendOrigin = _config.GetSection("Frontend:AllowedOrigins").Get<string[]>()?.FirstOrDefault()
                ?? "http://localhost:5173";
        }

        public async Task SendPlanExpiringIn1DayAsync(string email, string userName)
        {
            try
            {
                var subject = "Your Plan Expires Tomorrow";
                var body = BuildEmailTemplate($@"
                    <h1>Hello {userName},</h1>
                    <p>Your subscription plan will expire in 1 day.</p>
                    <p>If you don't renew your plan within 4 days, all your photos will be deleted.</p>
                    <p>Please <strong><a href='{_frontendOrigin}/buy'>renew your plan</a></strong> to continue using our service.</p>
                ");

                await SendEmailAsync(email, subject, body);
                _logger.LogInformation($"Plan expiration email (1 day) sent to {email}");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to send plan expiration email to {email}: {ex.Message}");
                throw;
            }
        }

        public async Task SendPlanExpiringIn3DaysAsync(string email, string userName)
        {
            try
            {
                var subject = "Plan Expiration: Final Notice - Your Data Will Be Deleted Tomorrow";
                var body = BuildEmailTemplate($@"
                    <h1>Hello {userName},</h1>
                    <p><strong>FINAL NOTICE:</strong> Your subscription plan has expired and will be deleted tomorrow.</p>
                    <p>If you do not renew your plan immediately, all your photos will be permanently erased tomorrow.</p>
                    <p>Please <strong><a href='{_frontendOrigin}/buy'>renew your plan now</a></strong> to prevent data loss.</p>
                ");

                await SendEmailAsync(email, subject, body);
                _logger.LogInformation($"Plan expiration final notice email (3 days) sent to {email}");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to send plan expiration final notice email to {email}: {ex.Message}");
                throw;
            }
        }

        public async Task SendPlanExpiredAsync(string email, string userName)
        {
            try
            {
                var subject = "Your Data Has Been Deleted - Plan Expired";
                var body = BuildEmailTemplate($@"
                    <h1>Hello {userName},</h1>
                    <p>Your subscription plan has expired and all your media files have been permanently deleted.</p>
                    <p>If you believe this is an error, please contact support.</p>
                    <p><a href='{_frontendOrigin}/buy'>View our plans</a></p>
                ");

                await SendEmailAsync(email, subject, body);
                _logger.LogInformation($"Plan expired notification email sent to {email}");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to send plan expired email to {email}: {ex.Message}");
                throw;
            }
        }

        public async Task SendBandwidthExceededAsync(string email, string userName)
        {
            try
            {
                var subject = "You've reached your bandwidth limit";
                var body = BuildEmailTemplate($@"
                    <h1>Hello {userName},</h1>
                    <p>Your media has used up the bandwidth included in your current plan for this cycle.</p>
                    <p>Your work is still being served, but to guarantee smooth playback for your audience we recommend
                       <strong><a href='{_frontendOrigin}/buy'>upgrading your plan or adding a bandwidth top-up</a></strong>.</p>
                    <p>Your allowance resets at the start of your next cycle.</p>
                ");

                await SendEmailAsync(email, subject, body);
                _logger.LogInformation($"Bandwidth exceeded email sent to {email}");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to send bandwidth exceeded email to {email}: {ex.Message}");
                // best-effort: never let a notification failure break media delivery
            }
        }

        public async Task SendPasswordResetCodeAsync(string email, string userName, string code, int minutesValid)
        {
            try
            {
                var subject = $"Your Ferry password reset code: {code}";
                var body = BuildEmailTemplate($@"
                    <h1>Hello {userName},</h1>
                    <p>Use this code to reset your Ferry password:</p>
                    <p class='code'>{code}</p>
                    <p>The code expires in <strong>{minutesValid} minutes</strong> and can only be used once.</p>
                    <p>If you didn't ask to reset your password you can ignore this email — your password stays unchanged.
                       Never share this code with anyone; Ferry will never ask you for it.</p>
                ");

                await SendEmailAsync(email, subject, body);
                _logger.LogInformation($"Password reset code email sent to {email}");
            }
            catch (Exception ex)
            {
                // Rethrow: unlike the notification emails, this one IS the feature — the caller
                // decides how to answer without leaking whether the address exists.
                _logger.LogError($"Failed to send password reset code to {email}: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Where contact-form messages go when nothing overrides it.
        ///
        /// This lives in code on purpose. appsettings.json is gitignored (see .gitignore), so a
        /// config-only recipient does not travel with the repository — the form worked on the machine
        /// where the key was added and failed everywhere else, which is exactly how it broke. A code
        /// default travels; `ContactUs:Recipient` (or the ContactUs__Recipient environment variable)
        /// still wins when set, so deployments can point it elsewhere without a rebuild.
        /// </summary>
        private const string DefaultContactRecipient = "spartaknikolov@gmail.com";

        public async Task SendContactMessageAsync(string senderName, string senderEmail, string subject, string message)
        {
            // The destination is configuration or the built-in default — never the request. Taking it
            // from input would turn this endpoint into an open relay for anyone who found it.
            var configured = _config["ContactUs:Recipient"];
            var recipient = string.IsNullOrWhiteSpace(configured) ? DefaultContactRecipient : configured;

            // A provider that isn't configured makes SendEmailAsync log and return, which would have
            // this method report success for a message that was never sent. A contact form that
            // silently swallows mail is worse than one that admits it is broken.
            if (!_emailProvider.Equals("Resend", StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrWhiteSpace(_config["Email:Resend:ApiKey"]))
            {
                _logger.LogError("Email provider is not configured — contact message dropped.");
                throw new InvalidOperationException("The contact form isn't configured yet.");
            }

            // Everything below is attacker-controlled text going into an HTML document, so it is
            // encoded rather than interpolated. Newlines are converted after encoding, so a message
            // keeps its paragraphs without letting a <br> through from the sender.
            var safeName = System.Net.WebUtility.HtmlEncode(senderName);
            var safeEmail = System.Net.WebUtility.HtmlEncode(senderEmail);
            var safeSubject = System.Net.WebUtility.HtmlEncode(subject);
            var safeMessage = System.Net.WebUtility.HtmlEncode(message).Replace("\n", "<br>");

            var body = BuildEmailTemplate($@"
                <h1>New message from the contact form</h1>
                <p><strong>From:</strong> {safeName} &lt;{safeEmail}&gt;</p>
                <p><strong>Subject:</strong> {safeSubject}</p>
                <hr>
                <p>{safeMessage}</p>
            ");

            // Subject is prefixed so these are filterable, and Reply-To is the sender so hitting
            // reply in a mail client actually answers the person who wrote in.
            await SendEmailAsync(recipient, $"[Contact] {subject}", body, replyTo: senderEmail);
            _logger.LogInformation("Contact form message forwarded to the site owners.");
        }

        public async Task SendDownloadRequestAsync(string ownerEmail, string ownerName, string requesterName, string fileName, string? message)
        {
            // Every value here came from a user: the requester picked their own display name and
            // wrote the note, and the file name is whatever the owner typed at upload. All of it is
            // encoded before it goes near the HTML, exactly as the contact form does.
            var safeOwner = System.Net.WebUtility.HtmlEncode(ownerName);
            var safeRequester = System.Net.WebUtility.HtmlEncode(requesterName);
            var safeFile = System.Net.WebUtility.HtmlEncode(fileName);
            var safeMessage = string.IsNullOrWhiteSpace(message)
                ? null
                : System.Net.WebUtility.HtmlEncode(message).Replace("\n", "<br>");

            var body = BuildEmailTemplate($@"
                <h1>Hello {safeOwner},</h1>
                <p><strong>{safeRequester}</strong> is asking to download <strong>{safeFile}</strong>.</p>
                {(safeMessage is null ? "" : $"<p><em>&ldquo;{safeMessage}&rdquo;</em></p>")}
                <p>Nothing has been shared yet — the file stays yours until you say otherwise.</p>
                <p><strong><a href='{_frontendOrigin}/requests'>Answer this request</a></strong></p>
            ");

            await SendEmailAsync(ownerEmail, $"Download request for {fileName}", body);
            _logger.LogInformation("Download request email sent to the owner of {FileName}.", fileName);
        }

        public async Task SendDownloadRequestDecisionAsync(string requesterEmail, string requesterName, string fileName, bool approved, bool revoked = false)
        {
            var safeRequester = System.Net.WebUtility.HtmlEncode(requesterName);
            var safeFile = System.Net.WebUtility.HtmlEncode(fileName);

            var inner = approved
                ? $@"
                    <h1>Hello {safeRequester},</h1>
                    <p>Your request for <strong>{safeFile}</strong> was approved.</p>
                    <p>The download is now available to you on the file itself, or from your requests.</p>
                    <p><strong><a href='{_frontendOrigin}/requests'>Go to your requests</a></strong></p>
                "
                : revoked
                    ? $@"
                    <h1>Hello {safeRequester},</h1>
                    <p>The owner has withdrawn your access to the original of <strong>{safeFile}</strong>.</p>
                    <p>You can still watch it wherever it's shared — only the original file stays with its owner.</p>
                "
                    : $@"
                    <h1>Hello {safeRequester},</h1>
                    <p>Your request for <strong>{safeFile}</strong> wasn't approved.</p>
                    <p>You can still watch it wherever it's shared — only the original file stays with its owner.</p>
                ";

            var body = BuildEmailTemplate(inner);

            var subject = approved
                ? $"Your download request was approved — {fileName}"
                : revoked
                    ? $"Download access withdrawn — {fileName}"
                    : $"Your download request for {fileName}";

            await SendEmailAsync(requesterEmail, subject, body);
            _logger.LogInformation("Download request decision email sent (approved: {Approved}).", approved);
        }

        public async Task SendMediaHiddenAsync(string ownerEmail, string ownerName, string fileName, string? reason)
        {
            var safeOwner = System.Net.WebUtility.HtmlEncode(ownerName);
            var safeFile = System.Net.WebUtility.HtmlEncode(fileName);
            var safeReason = string.IsNullOrWhiteSpace(reason)
                ? null
                : System.Net.WebUtility.HtmlEncode(reason).Replace("\n", "<br>");

            // What the owner needs to know, in order: the file is not gone, it is not visible, and
            // this was us rather than a fault of theirs to debug. A takedown with no explanation
            // reads as a bug, and they open a support ticket about a working system.
            var body = BuildEmailTemplate($@"
                <h1>Hello {safeOwner},</h1>
                <p>We've made <strong>{safeFile}</strong> private. It is no longer visible in the
                   gallery or on your public profile.</p>
                {(safeReason is null ? "" : $"<p><strong>Reason:</strong> {safeReason}</p>")}
                <p>The file itself is untouched — it's still in your library, and it still counts
                   towards your storage. Nothing was deleted.</p>
                <p>If you think this is a mistake, <strong><a href='{_frontendOrigin}/contact'>get in
                   touch</a></strong> and we'll take another look.</p>
            ");

            await SendEmailAsync(ownerEmail, $"Your file was made private — {fileName}", body);
            _logger.LogInformation("Media-hidden email sent to the owner of {FileName}.", fileName);
        }

        public async Task SendMediaRestoredAsync(string ownerEmail, string ownerName, string fileName)
        {
            var safeOwner = System.Net.WebUtility.HtmlEncode(ownerName);
            var safeFile = System.Net.WebUtility.HtmlEncode(fileName);

            // The counterpart matters as much as the takedown: somebody told they were hidden and
            // never told they were restored has to keep checking to find out.
            var body = BuildEmailTemplate($@"
                <h1>Hello {safeOwner},</h1>
                <p><strong>{safeFile}</strong> is public again and back in the gallery.</p>
                <p>Thanks for your patience.</p>
            ");

            await SendEmailAsync(ownerEmail, $"Your file is public again — {fileName}", body);
            _logger.LogInformation("Media-restored email sent to the owner of {FileName}.", fileName);
        }

        public async Task SendMediaDeletedAsync(string ownerEmail, string ownerName, string fileName, string? reason)
        {
            var safeOwner = System.Net.WebUtility.HtmlEncode(ownerName);
            var safeFile = System.Net.WebUtility.HtmlEncode(fileName);
            var safeReason = string.IsNullOrWhiteSpace(reason)
                ? null
                : System.Net.WebUtility.HtmlEncode(reason).Replace("\n", "<br>");

            // Said plainly, because it cannot be walked back. The one useful thing left to tell them
            // is that the storage came back, so their quota reading is not a second mystery.
            var body = BuildEmailTemplate($@"
                <h1>Hello {safeOwner},</h1>
                <p><strong>{safeFile}</strong> has been removed from Ferry.</p>
                {(safeReason is null ? "" : $"<p><strong>Reason:</strong> {safeReason}</p>")}
                <p>This one can't be undone — the file and its preview are gone from our storage.
                   The space it used has been returned to your quota.</p>
                <p>If you believe this was a mistake, <strong><a href='{_frontendOrigin}/contact'>get
                   in touch</a></strong>.</p>
            ");

            await SendEmailAsync(ownerEmail, $"Your file was removed — {fileName}", body);
            _logger.LogInformation("Media-deleted email sent to the former owner of {FileName}.", fileName);
        }

        public async Task SendRepublishDecisionAsync(
            string ownerEmail, string ownerName, string fileName, bool approved, string? note)
        {
            var safeOwner = System.Net.WebUtility.HtmlEncode(ownerName);
            var safeFile = System.Net.WebUtility.HtmlEncode(fileName);
            var safeNote = string.IsNullOrWhiteSpace(note)
                ? null
                : System.Net.WebUtility.HtmlEncode(note).Replace("\n", "<br>");

            var inner = approved
                ? $@"
                    <h1>Hello {safeOwner},</h1>
                    <p><strong>{safeFile}</strong> is public again.</p>
                    {(safeNote is null ? "" : $"<p>{safeNote}</p>")}
                    <p>It's back in the gallery and on your profile, and it's yours to manage as
                       normal from now on.</p>
                "
                : $@"
                    <h1>Hello {safeOwner},</h1>
                    <p>We've looked at your request for <strong>{safeFile}</strong> and it's staying
                       private for now.</p>
                    {(safeNote is null ? "" : $"<p><strong>Why:</strong> {safeNote}</p>")}
                    <p>The file itself is untouched and still in your library — only its public
                       listing is affected. If there's something we've missed,
                       <strong><a href='{_frontendOrigin}/contact'>tell us</a></strong>.</p>
                ";

            var subject = approved
                ? $"Your file is public again — {fileName}"
                : $"About your request for {fileName}";

            await SendEmailAsync(ownerEmail, subject, BuildEmailTemplate(inner));
            _logger.LogInformation("Re-publish decision email sent (approved: {Approved}).", approved);
        }

        private async Task SendEmailAsync(string recipientEmail, string subject, string htmlBody, string? replyTo = null)
        {
            if (_emailProvider.Equals("Resend", StringComparison.OrdinalIgnoreCase))
            {
                await SendViaResendAsync(recipientEmail, subject, htmlBody, replyTo);
            }
            else
            {
                _logger.LogWarning($"Email provider '{_emailProvider}' not configured. Email not sent.");
            }
        }

        private async Task SendViaResendAsync(string recipientEmail, string subject, string htmlBody, string? replyTo = null)
        {
            var resendApiKey = _config["Email:Resend:ApiKey"];

            if (string.IsNullOrEmpty(resendApiKey))
            {
                _logger.LogWarning("Resend API key not configured. Email not sent.");
                return;
            }

            using (var client = new HttpClient())
            {
                client.DefaultRequestHeaders.Add("Authorization", $"Bearer {resendApiKey}");

                object payload = string.IsNullOrWhiteSpace(replyTo)
                    ? new
                    {
                        from = _fromEmail,
                        to = recipientEmail,
                        subject = subject,
                        html = htmlBody
                    }
                    : new
                    {
                        from = _fromEmail,
                        to = recipientEmail,
                        subject = subject,
                        html = htmlBody,
                        reply_to = replyTo
                    };

                var jsonContent = System.Text.Json.JsonSerializer.Serialize(payload);
                var content = new StringContent(jsonContent, System.Text.Encoding.UTF8, "application/json");

                try
                {
                    var response = await client.PostAsync("https://api.resend.com/emails", content);
                    
                    if (response.IsSuccessStatusCode)
                    {
                        _logger.LogInformation($"Email sent successfully to {recipientEmail} via Resend");
                    }
                    else
                    {
                        var errorContent = await response.Content.ReadAsStringAsync();
                        _logger.LogError($"Resend API error ({response.StatusCode}): {errorContent}");
                        throw new Exception($"Resend API returned {response.StatusCode}: {errorContent}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError($"Error sending email to {recipientEmail} via Resend: {ex.Message}");
                    throw;
                }
            }
        }

        private string BuildEmailTemplate(string content)
        {
            return $@"
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset='utf-8'>
                    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
                    <style>
                        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; color: #333; margin: 0; padding: 0; }}
                        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                        .header {{ background: linear-gradient(160deg, #071E31, #041320); padding: 28px 30px; text-align: center; color: #F4FBFF; border-radius: 8px 8px 0 0; }}
                        .header h2 {{ margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -1px; color: #F4FBFF; }}
                        .header p {{ margin: 6px 0 0; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #6892AF; }}
                        .content {{ padding: 30px; background-color: #ffffff; border: 1px solid #e5e7eb; }}
                        .content h1 {{ color: #1f2937; margin-top: 0; }}
                        .content p {{ line-height: 1.6; color: #4b5563; }}
                        .footer {{ background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }}
                        .footer a {{ color: #0369A1; text-decoration: none; }}
                        .footer a:hover {{ text-decoration: underline; }}
                        a {{ color: #0369A1; text-decoration: none; font-weight: 600; }}
                        a:hover {{ text-decoration: underline; }}
                        .warning {{ color: #dc2626; font-weight: bold; }}
                        .code {{ font-family: Consolas, 'SFMono-Regular', Menlo, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; color: #1f2937; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 12px; margin: 24px 0; }}
                    </style>
                </head>
                <body>
                    <div class='container'>
                        <div class='header'>
                            <h2>&#9654;&#8195;Ferry</h2>
                            <p>Keep your resolution</p>
                        </div>
                        <div class='content'>
                            {content}
                        </div>
                        <div class='footer'>
                            <p>&copy; 2026 Ferry. All rights reserved.</p>
                            <p>If you have questions, please contact <a href='mailto:support@ferry.app'>support@ferry.app</a></p>
                        </div>
                    </div>
                </body>
                </html>
            ";
        }
    }
}
