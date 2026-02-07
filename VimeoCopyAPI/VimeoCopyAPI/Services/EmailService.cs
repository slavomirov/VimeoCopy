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

        public EmailService(IConfiguration config, ILogger<EmailService> logger)
        {
            _config = config;
            _logger = logger;
            _emailProvider = _config["Email:Provider"] ?? "Resend";
            _fromEmail = _config["Email:FromEmail"] ?? "onboarding@resend.dev";
            _fromName = _config["Email:FromName"] ?? "VimeoCopy";
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
                    <p>Please <strong><a href='https://vimeocopy.com/buy'>renew your plan</a></strong> to continue using our service.</p>
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
                    <p>Please <strong><a href='https://vimeocopy.com/buy'>renew your plan now</a></strong> to prevent data loss.</p>
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
                    <p><a href='https://vimeocopy.com/buy'>View our plans</a></p>
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

        private async Task SendEmailAsync(string recipientEmail, string subject, string htmlBody)
        {
            if (_emailProvider.Equals("Resend", StringComparison.OrdinalIgnoreCase))
            {
                await SendViaResendAsync(recipientEmail, subject, htmlBody);
            }
            else
            {
                _logger.LogWarning($"Email provider '{_emailProvider}' not configured. Email not sent.");
            }
        }

        private async Task SendViaResendAsync(string recipientEmail, string subject, string htmlBody)
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

                var payload = new
                {
                    from = _fromEmail,
                    to = recipientEmail,
                    subject = subject,
                    html = htmlBody
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
                        .header {{ background: linear-gradient(135deg, #6a5af9, #8f7bff); padding: 30px; text-align: center; color: white; border-radius: 8px 8px 0 0; }}
                        .header h2 {{ margin: 0; font-size: 24px; }}
                        .content {{ padding: 30px; background-color: #ffffff; border: 1px solid #e5e7eb; }}
                        .content h1 {{ color: #1f2937; margin-top: 0; }}
                        .content p {{ line-height: 1.6; color: #4b5563; }}
                        .footer {{ background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }}
                        .footer a {{ color: #6a5af9; text-decoration: none; }}
                        .footer a:hover {{ text-decoration: underline; }}
                        a {{ color: #6a5af9; text-decoration: none; font-weight: 600; }}
                        a:hover {{ text-decoration: underline; }}
                        .warning {{ color: #dc2626; font-weight: bold; }}
                    </style>
                </head>
                <body>
                    <div class='container'>
                        <div class='header'>
                            <h2>VimeoCopy</h2>
                        </div>
                        <div class='content'>
                            {content}
                        </div>
                        <div class='footer'>
                            <p>&copy; 2026 VimeoCopy. All rights reserved.</p>
                            <p>If you have questions, please contact <a href='mailto:support@vimeocopy.com'>support@vimeocopy.com</a></p>
                        </div>
                    </div>
                </body>
                </html>
            ";
        }
    }
}
