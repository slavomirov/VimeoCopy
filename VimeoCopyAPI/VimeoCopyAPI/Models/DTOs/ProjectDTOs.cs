using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models.DTOs;

// ──────── Request DTOs ────────

public class CreateProjectDTO
{
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = default!;

    [MaxLength(2000)]
    public string? Description { get; set; }

    /// <summary>Optional list of media IDs to add immediately.</summary>
    public List<Guid>? MediaIds { get; set; }

    /// <summary>Optional thumbnail media ID (must be one of MediaIds or already in project).</summary>
    public Guid? ThumbnailMediaId { get; set; }
}

public class UpdateProjectDTO
{
    [MaxLength(200)]
    public string? Title { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    public Guid? ThumbnailMediaId { get; set; }
}

public class AddMediaToProjectDTO
{
    [Required]
    public List<Guid> MediaIds { get; set; } = new();
}

public class RemoveMediaFromProjectDTO
{
    [Required]
    public List<Guid> MediaIds { get; set; } = new();
}

public class ReorderProjectMediaDTO
{
    /// <summary>Ordered list of media IDs representing the desired sort order.</summary>
    [Required]
    public List<Guid> MediaIds { get; set; } = new();
}

// ──────── Response DTOs ────────

public class ProjectSummaryDTO
{
    public Guid Id { get; set; }
    public string Title { get; set; } = default!;
    public string? Description { get; set; }
    public Guid? ThumbnailMediaId { get; set; }
    public int MediaCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ProjectDetailDTO
{
    public Guid Id { get; set; }
    public string Title { get; set; } = default!;
    public string? Description { get; set; }
    public Guid? ThumbnailMediaId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<ProjectMediaItemDTO> Media { get; set; } = new();
}

public class ProjectMediaItemDTO
{
    public Guid Id { get; set; }
    public string ContentType { get; set; } = default!;
    public long FileSize { get; set; }
    public DateTime UploadedAt { get; set; }
    public bool IsPublic { get; set; }
    public int SortOrder { get; set; }
    public bool HasThumbnail { get; set; }
}
