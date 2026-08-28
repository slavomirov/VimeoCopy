using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Models;

public class ApplicationUser : IdentityUser
{
    // Storage & bandwidth are tracked in BYTES (source of truth). Convert only for display.
    public long? UsedMemory { get; set; }
    public long? BuyedMemory { get; set; }
    public long? BuyedBandwidth { get; set; }
    public long? UsedBandwidth { get; set; }

    /// <summary>Start of the current bandwidth billing cycle; UsedBandwidth resets when it rolls over.</summary>
    public DateTime? BandwidthCycleStart { get; set; }

    /// <summary>Last time the owner was emailed about exceeding bandwidth this cycle (throttles notifications).</summary>
    public DateTime? BandwidthOverageNotifiedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── Public artist profile ──────────────────────────────
    /// <summary>Unique, URL-safe handle (e.g. "jane-doe"). Null until the user claims one.</summary>
    [MaxLength(30)]
    public string? Handle { get; set; }

    /// <summary>Public display name shown on the profile. Falls back to Handle when null.</summary>
    [MaxLength(60)]
    public string? DisplayName { get; set; }

    /// <summary>Free-form artist statement / bio.</summary>
    [MaxLength(1000)]
    public string? Bio { get; set; }

    /// <summary>Optional external link (portfolio, socials, shop...).</summary>
    [MaxLength(300)]
    public string? WebsiteUrl { get; set; }

    [MaxLength(100)]
    public string? Location { get; set; }

    /// <summary>One of the user's own media used as the avatar.</summary>
    public Guid? AvatarMediaId { get; set; }

    /// <summary>One of the user's own media used as the profile banner.</summary>
    public Guid? BannerMediaId { get; set; }

    /// <summary>
    /// Which horizontal slice of the banner image stays visible once it is cropped to the banner
    /// strip, as a CSS object-position percentage: 0 = align the top edge, 50 = centred,
    /// 100 = align the bottom edge. Repositioning is non-destructive — the original upload is
    /// untouched, so the owner can re-adjust at any time.
    /// </summary>
    public int BannerOffsetY { get; set; } = 50;

    /// <summary>Serialized artist theme tokens (palette / fonts / radius / background).</summary>
    public string? ThemeJson { get; set; }

    /// <summary>When false, the profile is hidden from search and direct access.</summary>
    public bool IsProfilePublic { get; set; } = true;

    [JsonIgnore]
    public ICollection<Media> Media { get; set; } = new List<Media>();

    [JsonIgnore]
    public ICollection<Project> Projects { get; set; } = new List<Project>();

    public Plan? Plan { get; set; }
    public int? PlanId { get; set; }
    public DateTime? PlanExpiration { get; set; }
}
