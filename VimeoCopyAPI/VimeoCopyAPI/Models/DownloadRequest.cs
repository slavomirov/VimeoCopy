using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

/// <summary>
/// A viewer asking the owner for the original file, and the owner's answer.
///
/// This is the middle ground the platform was missing: a file was either downloadable by everyone
/// or by nobody. An approved request grants ONE requester the right to download ONE file, without
/// the owner having to flip the public <see cref="Media.Downloadable"/> flag for the whole internet.
///
/// Only owners whose plan includes downloads can receive these, because an approval they could
/// never honour is worse than no button at all — see Plan.AllowDownloads.
/// </summary>
public class DownloadRequest
{
    public long Id { get; set; }

    public Guid MediaId { get; set; }

    /// <summary>
    /// Who asked. Never null: a grant has to belong to somebody, and the answer has to be
    /// deliverable — which rules out anonymous requests.
    /// </summary>
    [Required]
    public string RequesterUserId { get; set; } = default!;

    /// <summary>
    /// Who decides. Copied from the media at creation time rather than joined on every read: it is
    /// the hot path for the owner's inbox, and media ownership does not change.
    /// </summary>
    [Required]
    public string OwnerUserId { get; set; } = default!;

    /// <summary>Pending | Approved | Denied. Approved is what the download endpoint checks.</summary>
    [MaxLength(20)]
    public string Status { get; set; } = DownloadRequestStatus.Pending;

    /// <summary>Optional note from the requester — why they want the original.</summary>
    [MaxLength(500)]
    public string? Message { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the owner last answered. Null while pending.</summary>
    public DateTime? DecidedAt { get; set; }
}

/// <summary>The three states, in one place, so no string literal decides behaviour twice.</summary>
public static class DownloadRequestStatus
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Denied = "Denied";
}
