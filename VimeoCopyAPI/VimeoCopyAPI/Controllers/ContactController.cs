using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/contact")]
[AllowAnonymous] // a contact form no one can reach without an account is not a contact form
[EnableRateLimiting("contact")]
public class ContactController : ControllerBase
{
    private readonly IEmailService _emailService;
    private readonly ILogger<ContactController> _logger;

    public ContactController(IEmailService emailService, ILogger<ContactController> logger)
    {
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>
    /// Forwards a message to the site owners. Anonymous and therefore rate limited hard — the
    /// global 240/min ceiling is far too generous for something that sends mail on our account.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Send([FromBody] ContactMessageDTO dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        try
        {
            await _emailService.SendContactMessageAsync(
                dto.Name.Trim(), dto.Email.Trim(), dto.Subject.Trim(), dto.Message.Trim());
        }
        catch (InvalidOperationException ex)
        {
            // Recipient isn't configured. That is our problem, not the sender's, so say so plainly
            // instead of reporting a success the message never had.
            _logger.LogError(ex, "Contact form is not configured");
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { message = "The contact form isn't available right now. Please try again later." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to forward a contact message");
            return StatusCode(StatusCodes.Status502BadGateway,
                new { message = "We couldn't send that message. Please try again in a moment." });
        }

        return Ok(new { message = "Thanks — your message is on its way." });
    }
}
