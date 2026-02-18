using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using VimeoCopyAPI.Models;

namespace VimeoCopyApi.Models;

public class Project
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    [MaxLength(200)]
    public required string Title { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    /// <summary>
    /// MediaId used as the project thumbnail. Must be one of the project's media items.
    /// </summary>
    public Guid? ThumbnailMediaId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Owner
    [Required]
    public string UserId { get; set; } = default!;

    [JsonIgnore]
    public ApplicationUser User { get; set; } = default!;

    // Navigation – many-to-many via join entity
    [JsonIgnore]
    public ICollection<ProjectMedia> ProjectMedias { get; set; } = new List<ProjectMedia>();
}
