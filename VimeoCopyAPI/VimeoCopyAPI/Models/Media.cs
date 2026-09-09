using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using VimeoCopyAPI.Models;

namespace VimeoCopyApi.Models;

public class Media
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    [Range(1, long.MaxValue)]
    public required long FileSize { get; set; }

    [Required]
    [MaxLength(100)]
    public required string ContentType { get; set; }

    [Required]
    public DateTime UploadedAt { get; set; }

    // Uploaded → Processing → Ready
    [Required]
    [MaxLength(50)]
    public string Status { get; set; } = "Uploaded";

    public string? ThumbnailUrl { get; set; } //add thumbnails saved in the database for faster access

    /// <summary>
    /// Bytes the stored thumbnail occupies, so it can be charged to the owner's quota and refunded
    /// on delete. Null for media uploaded before thumbnails were metered.
    /// </summary>
    public long? ThumbnailSize { get; set; }

    [MaxLength(500)]
    public string? VideoUrl { get; set; }

    /// <summary>
    /// Storage key of the hover-preview clip the GIF generator produced (key = gif_{Id}), or null
    /// when the media has none: audio, an image, a generator failure, or a video uploaded before the
    /// feature existed. When it is null the gallery falls back to hovering the full file.
    /// </summary>
    [MaxLength(500)]
    public string? GifUrl { get; set; }

    /// <summary>
    /// Bytes the stored clip occupies, charged to the owner's quota and refunded on delete, exactly
    /// like <see cref="ThumbnailSize"/>.
    /// </summary>
    public long? GifSize { get; set; }

    /// <summary>
    /// Container the clip was recorded in. The generating browser picks it — Chrome and Firefox emit
    /// WebM, Safari MP4 — so it is stored rather than assumed, and it types both the presigned PUT
    /// and the object served back to the gallery.
    /// </summary>
    [MaxLength(100)]
    public string? GifContentType { get; set; }

    public bool IsPublic { get; set; } = true;

    /// <summary>When true, the media appears on the public Media Gallery page.</summary>
    public bool ShowOnMediaPage { get; set; } = true;

    /// <summary>
    /// True for an image uploaded purely as profile decoration (avatar or banner). It is the
    /// owner's private file: kept out of the media gallery, the owner's library, the project
    /// pickers and the public portfolio, and only ever surfaced through the profile's own
    /// presigned avatar/banner URL.
    /// </summary>
    public bool IsProfileAsset { get; set; } = false;

    /// <summary>
    /// Whether the owner offers this file as a download. Off by default: a download hands over the
    /// original file, so it has to be opted into per file, never inferred. It is only honoured while
    /// the owner's plan also allows downloads — both must be true, so a file stays flagged if a plan
    /// lapses and starts working again on renewal rather than silently resetting.
    /// </summary>
    public bool Downloadable { get; set; }

    /// <summary>
    /// Whether this file is part of the owner's showreel — the curated set a visitor can ask to
    /// download in one go, as a portfolio or a CV.
    ///
    /// Separate from <see cref="Downloadable"/> on purpose. That flag says "anyone may take this
    /// one file"; this one says "this belongs in the bundle I hand to a prospective client", and an
    /// artist wants those to be different lists. A showreel is still gated behind an approved
    /// request, so marking a file here gives nothing away by itself.
    /// </summary>
    public bool InShowreel { get; set; }

    /// <summary>Optional user-provided description for the media.</summary>
    [MaxLength(2000)]
    public string? Description { get; set; }

    /// <summary>Original file name preserved from upload.</summary>
    [MaxLength(500)]
    public string? FileName { get; set; }

    // Owner FK and navigation
    public string UserId { get; set; }
    [JsonIgnore]
    public ApplicationUser User { get; set; } = default!;
}
