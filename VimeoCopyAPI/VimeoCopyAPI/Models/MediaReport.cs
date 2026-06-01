using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

/// <summary>A user/visitor report flagging a piece of media for moderator review.</summary>
public class MediaReport
{
    public long Id { get; set; }

    public Guid MediaId { get; set; }

    /// <summary>Reporter's user id, or null if reported anonymously.</summary>
    public string? ReporterUserId { get; set; }

    [Required]
    [MaxLength(50)]
    public string Reason { get; set; } = default!; // e.g. "copyright", "explicit", "spam", "other"

    [MaxLength(1000)]
    public string? Details { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "Pending"; // Pending | Removed | Dismissed

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? ReviewedAt { get; set; }
    public string? ReviewedByUserId { get; set; }
}
