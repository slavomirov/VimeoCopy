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

    [MaxLength(500)]
    public string? VideoUrl { get; set; }

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
