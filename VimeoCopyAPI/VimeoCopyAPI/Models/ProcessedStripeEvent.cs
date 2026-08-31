using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

/// <summary>
/// A Stripe event id we have already acted on. Stripe redelivers on any timeout or 5xx, and
/// handling checkout.session.completed twice grants a second month of plan and resets the
/// bandwidth cycle again — several months of service for one payment.
/// </summary>
public class ProcessedStripeEvent
{
    /// <summary>The Stripe event id (evt_…).</summary>
    [Key]
    [MaxLength(100)]
    public string Id { get; set; } = default!;

    [MaxLength(100)]
    public string? Type { get; set; }

    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
}
