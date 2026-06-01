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

    public StripeController(IOptionsSnapshot<StripeOptions> stripeOptions, IPlanService planService)
    {
        _stripeOptions = stripeOptions.Value;
        _planService = planService;
    }

    [Authorize]
    [HttpPost("test")]
    public async Task<IActionResult> Payment([FromBody] PaymentRequest request)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userEmail = User.FindFirst(ClaimTypes.Email)?.Value;

        var plan = await _planService.GetPlayByNameAsync(request.Name) ?? throw new Exception("Plan not available!");
        var origin = $"http://localhost:5173"; //FE server change this

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

    [Authorize]
    [HttpPost("bandwidth-addon")]
    public async Task<IActionResult> BuyBandwidthAddon([FromBody] PaymentRequest request)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userEmail = User.FindFirst(ClaimTypes.Email)?.Value;

        var addon = await _planService.GetBandwidthAddonByNameAsync(request.Name)
            ?? throw new Exception("Bandwidth add-on not available!");

        var origin = $"http://localhost:5173";

        StripeConfiguration.ApiKey = _stripeOptions.SecretKey;
        var stripeSessionService = new SessionService();

        var session = await stripeSessionService.CreateAsync(new SessionCreateOptions
        {
            Mode = "payment",
            ClientReferenceId = userId,
            SuccessUrl = $"{origin}/profile",
            CancelUrl = $"{origin}/buy",
            CustomerEmail = userEmail,
            Metadata = new Dictionary<string, string>
            {
                { "type", "bandwidth-addon" },
                { "targetName", addon.Name },
            },
            LineItems =
            [
                new ()
                {
                    PriceData = new ()
                    {
                        UnitAmountDecimal = addon.Price,
                        Currency = "EUR",
                        ProductData = new ()
                        {
                            Name = addon.Name,
                            Description = addon.Description,
                        },
                    },
                    Quantity = 1
                }
            ]
        });

        return Ok(new { RedirectUrl = session.Url });
    }

    [HttpGet("bandwidth-addons")]
    public async Task<IActionResult> ListBandwidthAddons()
        => Ok(await _planService.GetBandwidthAddonsAsync());
}

public record PaymentRequest(string Name);
