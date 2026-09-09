using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

/// <summary>
/// An owner asking staff to put a taken-down file back.
///
/// The appeal half of moderation. Hiding a file is a decision made without the owner in the room,
/// and until now the only thing they could do about it was email support — the flag said nothing
/// and the visibility toggle simply refused. This gives that refusal somewhere to go: a reason
/// written by the owner, an inbox for staff, and an answer that reaches the owner by email.
///
/// One live request per file, enforced in the service. An owner who can queue ten appeals for the
/// same takedown has been handed the same megaphone the download-request cooling-off exists to
/// prevent.
/// </summary>
public class RepublishRequest
{
    public long Id { get; set; }

    public Guid MediaId { get; set; }

    /// <summary>
    /// Who is appealing. Copied rather than joined for the same reason the download request copies
    /// its owner: it is the hot path for the staff inbox, and media ownership does not change.
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string OwnerUserId { get; set; } = default!;

    /// <summary>The owner's case for putting it back. Required — an appeal with no argument is noise.</summary>
    [Required]
    [MaxLength(1000)]
    public string Reason { get; set; } = default!;

    /// <summary>Pending | Approved | Denied.</summary>
    [MaxLength(20)]
    public string Status { get; set; } = RepublishRequestStatus.Pending;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? DecidedAt { get; set; }

    [MaxLength(450)]
    public string? DecidedByUserId { get; set; }

    /// <summary>
    /// What staff said back. Optional on an approval, where the outcome speaks for itself; the
    /// place to explain a refusal, because a second "no" with no reason is what makes an owner
    /// open a third appeal.
    /// </summary>
    [MaxLength(500)]
    public string? DecisionNote { get; set; }
}

/// <summary>The three states, in one place, so no string literal decides behaviour twice.</summary>
public static class RepublishRequestStatus
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Denied = "Denied";
}
