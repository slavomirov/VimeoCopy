using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

/// <summary>
/// One-time bandwidth top-up pack. Added on top of the user's current plan
/// allowance and consumed within the same plan cycle.
/// </summary>
public class BandwidthAddon
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = default!;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Required]
    public long BandwidthMB { get; set; }

    /// <summary>Price in cents.</summary>
    [Required]
    public long Price { get; set; }
}
