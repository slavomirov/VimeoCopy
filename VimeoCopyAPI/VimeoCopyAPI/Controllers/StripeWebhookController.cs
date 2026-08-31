using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.Checkout;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/payments/webhook")]
public class StripeWebhookController : ControllerBase
{
    private readonly StripeOptions _stripeOptions;
    private readonly IUserService _userService;
    private readonly AppDbContext _db;
    private readonly ILogger<StripeWebhookController> _logger;

    public StripeWebhookController(
        IOptionsSnapshot<StripeOptions> stripeOptions,
        IUserService userService,
        AppDbContext db,
        ILogger<StripeWebhookController> logger)
    {
        _stripeOptions = stripeOptions.Value;
        _userService = userService;
        _db = db;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Handle()
    {
        var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(
                json,
                Request.Headers["Stripe-Signature"],
                _stripeOptions.WebhookSecret
            );
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Rejected Stripe webhook with an invalid signature: {Message}", ex.Message);
            return BadRequest();
        }

        // Stripe retries on any non-2xx or timeout, so the same event arrives more than once.
        // Claiming the id first makes handling exactly-once.
        if (await _db.ProcessedStripeEvents.AnyAsync(e => e.Id == stripeEvent.Id))
        {
            _logger.LogInformation("Ignoring already-processed Stripe event {EventId}", stripeEvent.Id);
            return Ok();
        }

        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
                await HandleCheckoutSessionCompletedAsync(stripeEvent);
                break;

            case "payment_intent.payment_failed":
                if (stripeEvent.Data.Object is PaymentIntent intent)
                    _logger.LogInformation("Payment failed: {IntentId}", intent.Id);
                break;
        }

        await MarkProcessedAsync(stripeEvent);
        return Ok();
    }

    private async Task MarkProcessedAsync(Event stripeEvent)
    {
        _db.ProcessedStripeEvents.Add(new ProcessedStripeEvent
        {
            Id = stripeEvent.Id,
            Type = stripeEvent.Type,
        });

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Two concurrent deliveries of the same event: the unique key rejected the second write,
            // which is exactly the protection we wanted. Nothing to do.
            _db.ChangeTracker.Clear();
        }
    }

    private async Task HandleCheckoutSessionCompletedAsync(Event stripeEvent)
    {
        if (stripeEvent.Data.Object is not Session session)
            return;

        var userId = session.ClientReferenceId;
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("Checkout session {SessionId} carried no ClientReferenceId", session.Id);
            return;
        }

        // Prefer session metadata (set explicitly when we created the session).
        // Fall back to line item description for legacy plan sessions created before metadata was added.
        session.Metadata ??= new Dictionary<string, string>();
        session.Metadata.TryGetValue("targetName", out var targetName);

        if (string.IsNullOrEmpty(targetName))
        {
            var lineItems = await new SessionLineItemService().ListAsync(session.Id);
            targetName = lineItems.Data.FirstOrDefault()?.Description;
        }

        if (string.IsNullOrEmpty(targetName))
        {
            _logger.LogWarning("Could not determine the plan for checkout session {SessionId}", session.Id);
            return;
        }

        await _userService.AssignPlanToUserAsync(userId, targetName);
        _logger.LogInformation("Plan '{Plan}' assigned to user {UserId}", targetName, userId);
    }
}
