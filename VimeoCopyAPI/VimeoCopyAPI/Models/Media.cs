using System.ComponentModel.DataAnnotations;

namespace VimeoCopyApi.Models;

public class Media
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    [MaxLength(255)]
    public required string FileName { get; set; }

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

    public string? ThumbnailUrl { get; set; }

    [MaxLength(500)]
    public string? VideoUrl { get; set; }
}
