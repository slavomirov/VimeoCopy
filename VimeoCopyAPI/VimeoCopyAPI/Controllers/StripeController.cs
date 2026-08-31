using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.Checkout;
using System.Security.Claims;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/payments")]
public class StripeController : ControllerBase
{
    private readonly StripeOptions _stripeOptions;
    private readonly IPlanService _planService;
    private readonly string _frontendOrigin;

    public StripeController(IOptionsSnapshot<StripeOptions> stripeOptions, IPlanService planService, IConfiguration config)
    {
        _stripeOptions = stripeOptions.Value;
        _planService = planService;

        // Where Stripe sends the customer back to. This was hard-coded to localhost, so in any
        // deployed environment a successful payment redirected to a dead address.
        _frontendOrigin = config.GetSection("Frontend:AllowedOrigins").Get<string[]>()?.FirstOrDefault()
            ?? "http://localhost:5173";
    }

    [Authorize]
    [HttpPost("test")]
    public async Task<IActionResult> Payment([FromBody] PaymentRequest request)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userEmail = User.FindFirst(ClaimTypes.Email)?.Value;

        var plan = await _planService.GetPlayByNameAsync(request.Name)
            ?? throw new NotFoundException("That plan isn't available.");
        var origin = _frontendOrigin;

        StripeConfiguration.ApiKey = _stripeOptions.SecretKey;

        var stripeSessionService = new SessionService();

        var stripeCheckoutSession = await stripeSessionService
            .CreateAsync(new SessionCreateOptions
            {
                Mode = "payment",
                ClientReferenceId = userId,
                SuccessUrl = $"{origin}/profile",
                CancelUrl = $"{origin}/buy",
                CustomerEmail = userEmail,
                Metadata = new Dictionary<string, string>
                {
                    { "type", "plan" },
                    { "targetName", plan.Name },
                },
                LineItems =
                [
                    new ()
                    {
                        PriceData = new ()
                        {
                            UnitAmountDecimal = plan.Price, // in cents
                            Currency = "EUR",
                            ProductData = new ()
                            {
                                Name = plan.Name,
                            },
                        },
                        Quantity = 1
                    }
                ]
            });

        return Ok(new { RedirectUrl = stripeCheckoutSession.Url });
    }

}

public record PaymentRequest(string Name);
