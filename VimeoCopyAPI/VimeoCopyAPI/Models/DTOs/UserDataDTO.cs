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

    // Owner info
    public string OwnerEmail { get; set; } = default!;
    public string? OwnerUsername { get; set; }
    public string? OwnerHandle { get; set; }

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
