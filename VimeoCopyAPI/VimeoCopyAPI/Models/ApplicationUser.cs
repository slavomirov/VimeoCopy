using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Models;

public class ApplicationUser : IdentityUser
{
    public long? UsedMemory { get; set; }
    public long? BuyedMemory { get; set; }
    public long? BuyedBandwidth { get; set; }
    public long? UsedBandwidth { get; set; }

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
