using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.Checkout;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/payments/webhook")]
public class StripeWebhookController : ControllerBase
{
    private readonly StripeOptions _stripeOptions;
    private readonly IUserService _userService;

    public StripeWebhookController(IOptionsSnapshot<StripeOptions> stripeOptions, IUserService userService)
    {
        _stripeOptions = stripeOptions.Value;
        _userService = userService;
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
            Console.WriteLine($"⚠ Invalid Stripe webhook signature: {ex.Message}");
            return BadRequest();
        }

        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
                await HandleCheckoutSessionCompletedAsync(stripeEvent);
                break;

            case "payment_intent.payment_failed":
                HandlePaymentIntentFailed(stripeEvent);
                break;

            default:
                // Не ни трябва обработка за други събития
                break;
        }

        return Ok();
    }

    private async Task HandleCheckoutSessionCompletedAsync(Event stripeEvent)
    {
        var session = stripeEvent.Data.Object as Session;
        if (session == null)
            return;

        Console.WriteLine("➡ checkout.session.completed received");

        var userId = session.ClientReferenceId;
        if (string.IsNullOrEmpty(userId))
        {
            Console.WriteLine("⚠ Session missing ClientReferenceId");
            return;
        }

        // Prefer session metadata (set explicitly when we created the session).
        // Fall back to line item description for legacy plan sessions created before metadata was added.
        session.Metadata ??= new Dictionary<string, string>();
        session.Metadata.TryGetValue("targetName", out var targetName);

        if (string.IsNullOrEmpty(targetName))
        {
            var lineItems = await new SessionService().ListLineItemsAsync(session.Id);
            targetName = lineItems.Data.FirstOrDefault()?.Description;
        }

        if (string.IsNullOrEmpty(targetName))
        {
            Console.WriteLine("⚠ Could not determine product target for session");
            return;
        }

        // Only plan purchases remain (bandwidth add-ons removed — R2 egress is free).
        await _userService.AssignPlanToUserAsync(userId, targetName);
        Console.WriteLine($"✔ Plan '{targetName}' assigned to user {userId}");

        Console.WriteLine("🎉 PAYMENT SUCCESS");
    }

    private void HandlePaymentIntentFailed(Event stripeEvent)
    {
        var intent = stripeEvent.Data.Object as PaymentIntent;
        if (intent == null)
            return;

        Console.WriteLine($"❌ Payment failed: {intent.Id}");
    }
}
