using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.Checkout;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/payments")]
public class StripeController : ControllerBase
{
    private readonly StripeOptions _stripeOptions;

    public StripeController(IOptionsSnapshot<StripeOptions> stripeOptions)
    {
        _stripeOptions = stripeOptions.Value;
    }

    [HttpPost("test")]
    public async Task<IActionResult> Payment([FromBody] TestPaymentRequest request)
    {
        var product = new { Id = 1, Description = "testWE", Price = 10m };
        var origin = $"http://localhost:5173"; //FE server

        StripeConfiguration.ApiKey = _stripeOptions.SecretKey;

        var stripeSessionService = new SessionService();

        var stripeCheckoutSession = await stripeSessionService
            .CreateAsync(new SessionCreateOptions
            {
                Mode = "payment",
                ClientReferenceId = Guid.NewGuid().ToString(),
                SuccessUrl = $"{origin}/upload",
                CancelUrl = $"{origin}/",
                CustomerEmail = "test@abv.bg", //TODO: get from user profile,
                LineItems = new List<SessionLineItemOptions>
                {
                    new ()
                    {
                        PriceData = new ()
                        {
                            UnitAmountDecimal = product.Price * 100, // in cents
                            Currency = "EUR",
                            ProductData = new ()
                            {
                                Name = product.Description
                            },
                        },
                        Quantity = 1
                    }
                }
            });

        // Placeholder implementation
        return Ok(new { RedirectUrl = stripeCheckoutSession.Url });
    }
}

public record TestPaymentRequest(int Id);
