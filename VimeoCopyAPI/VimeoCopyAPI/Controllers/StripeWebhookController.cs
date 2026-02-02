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

        // Взимаме line items
        var lineItems = await new SessionService().ListLineItemsAsync(session.Id);
        var item = lineItems.Data.FirstOrDefault();

        if (item == null)
        {
            Console.WriteLine("⚠ No line items found for session");
            return;
        }

        var productName = item.Description;
        var price = item.AmountTotal / 100m;
        var currency = item.Currency;
        var quantity = item.Quantity;
        var userId = session.ClientReferenceId;
        var email = session.CustomerEmail;
        
        await _userService.AssignPlanToUserAsync(userId, productName);

        // Тук можеш да добавиш идемпотентност:
        // if (_db.Payments.Any(p => p.SessionId == session.Id)) return;

        Console.WriteLine($"✔ Product: {productName}, Price: {price} {currency}, Qty: {quantity}");
        Console.WriteLine($"✔ User: {userId}, Email: {email}");

        // Тук е моментът, в който плащането е напълно успешно
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
