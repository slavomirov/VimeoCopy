using System.ComponentModel.DataAnnotations;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Models;

public class Plan
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; }

    [Required]
    public long StorageLimitMB { get; set; }

    [Required]
    public long BandwidthMB { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }

    public long Price { get; set; }

    /// <summary>
    /// Whether creators on this plan may offer their files for download. A column rather than a
    /// hardcoded plan name, so which tiers include it is an operational decision that can be
    /// changed in the database without a deploy.
    /// </summary>
    public bool AllowDownloads { get; set; }

    public ICollection<ApplicationUser> Users { get; set; } = [];
}
