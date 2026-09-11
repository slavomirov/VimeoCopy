namespace VimeoCopyAPI.Models.DTOs;

public class UserDataDTO
{
    public string Id { get; set; }
    public string Email { get; set; }
    public string Username { get; set; }
    public long? BuyedMemory { get; set; }
    public long? UsedMemory { get; set; }
    public long? FreeMemory { get; set; }
    public long? BuyedBandwidth { get; set; }
    public long? UsedBandwidth { get; set; }
    public long? FreeBandwidth { get; set; }
    public DateTime? PlanExpiration { get; set; }
    public string? PlanName { get; set; }
    public string? PlanDescription { get; set; }
    public List<MediaDTO> Media { get; set; }
}

public class MediaDTO
{
    public Guid Id { get; set; }
    public string ContentType { get; set; }
    public long FileSize { get; set; }
    public DateTime UploadedAt { get; set; }
    public string Status { get; set; }
    public bool IsPublic { get; set; }
    public bool HasThumbnail { get; set; }
    /// <summary>True once the GIF generator has stored a hover-preview clip for this media.</summary>
    public bool HasGif { get; set; }
    /// <summary>Whether the owner offers this file for download.</summary>
    public bool Downloadable { get; set; }

    /// <summary>Whether the owner pinned this file to the top of their public profile.</summary>
    public bool Pinned { get; set; }

    /// <summary>
    /// True when staff took this file down. The owner cannot publish it themselves while this is
    /// set — the dashboard offers a re-publish appeal instead of a visibility toggle.
    /// </summary>
    public bool StaffHidden { get; set; }

    /// <summary>Why staff hid it, so the owner can answer it rather than guess.</summary>
    public string? StaffHiddenReason { get; set; }
    public bool ShowOnMediaPage { get; set; }
    public string? Description { get; set; }
    public string? FileName { get; set; }
}

/// <summary>DTO returned by the public media gallery endpoint.</summary>
public class PublicMediaDTO
{
    public Guid Id { get; set; }
    public string? FileName { get; set; }
    public string ContentType { get; set; } = default!;
    public long FileSize { get; set; }
    public DateTime UploadedAt { get; set; }
    public string Status { get; set; } = default!;
    public bool IsPublic { get; set; }
    public string? Description { get; set; }
    public bool HasThumbnail { get; set; }

    /// <summary>
    /// Whether a visitor may download this file. Already accounts for the owner's plan, so the
    /// client can show the button on this alone rather than knowing anything about plans.
    /// </summary>
    public bool Downloadable { get; set; }

    /// <summary>
    /// Whether a viewer may ask the owner for the original — true when the owner's plan includes
    /// downloads but they haven't offered this file to everyone. Also plan-resolved server-side, so
    /// the client never has to reason about tiers; the two flags are mutually exclusive by
    /// construction, and both false means the owner simply can't serve downloads.
    /// </summary>
    public bool DownloadRequestable { get; set; }

    // Presigned up front so the gallery doesn't need a round trip per tile. Unmetered — browsing a
    // grid must not charge the owner's bandwidth; the metered URL is fetched only on play.
    public string? PreviewUrl { get; set; }
    public string? ThumbnailUrl { get; set; }

    /// <summary>
    /// The GIF-generator clip for hover playback — a few hundred KB instead of the whole file, which
    /// is the entire reason it exists. Null means no clip was generated, and the grid falls back to
    /// hovering PreviewUrl.
    /// </summary>
    public string? GifUrl { get; set; }

    // Owner info — public identity only. Never the email address: this endpoint is anonymous, and
    // returning it here handed every visitor a scrapeable list of every creator's address.
    public string? OwnerHandle { get; set; }
    public string OwnerDisplayName { get; set; } = default!;

    // If the media belongs to a project, include project info
    public Guid? ProjectId { get; set; }
    public string? ProjectTitle { get; set; }
    public string? ProjectDescription { get; set; }
    public Guid? ProjectThumbnailMediaId { get; set; }
    public int? ProjectMediaCount { get; set; }
}

public class UpdateMediaDetailsDTO
{
    public string? Description { get; set; }
    public bool? ShowOnMediaPage { get; set; }
}
