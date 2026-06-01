namespace VimeoCopyAPI.Models.DTOs;

/// <summary>Public, sanitized artist profile. Never exposes email, storage, bandwidth or billing.</summary>
public class PublicProfileDTO
{
    public string Handle { get; set; } = default!;
    public string DisplayName { get; set; } = default!;
    public string? Bio { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? Location { get; set; }
    public DateTime CreatedAt { get; set; }

    /// <summary>Presigned URL for the avatar image (null when unset).</summary>
    public string? AvatarUrl { get; set; }

    /// <summary>Presigned URL for the banner image (null when unset).</summary>
    public string? BannerUrl { get; set; }

    /// <summary>Raw theme-token JSON the client applies as CSS variables (null = default theme).</summary>
    public string? ThemeJson { get; set; }

    public List<ProfileWorkDTO> Works { get; set; } = [];
}

/// <summary>A single public work shown on an artist profile.</summary>
public class ProfileWorkDTO
{
    public Guid Id { get; set; }
    public string? FileName { get; set; }
    public string ContentType { get; set; } = default!;
    public string? Description { get; set; }
    public bool HasThumbnail { get; set; }
    public DateTime UploadedAt { get; set; }
    public Guid? ProjectId { get; set; }
    public string? ProjectTitle { get; set; }
}

/// <summary>Lightweight card returned by artist search.</summary>
public class ProfileSearchResultDTO
{
    public string Handle { get; set; } = default!;
    public string DisplayName { get; set; } = default!;
    public string? AvatarUrl { get; set; }
    public int WorkCount { get; set; }
}

/// <summary>Editable profile settings returned to the owner.</summary>
public class MyProfileDTO
{
    public string? Handle { get; set; }
    public string? DisplayName { get; set; }
    public string? Bio { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? Location { get; set; }
    public Guid? AvatarMediaId { get; set; }
    public Guid? BannerMediaId { get; set; }
    public string? ThemeJson { get; set; }
    public bool IsProfilePublic { get; set; }
}

/// <summary>Payload for updating the owner's profile.</summary>
public class UpdateProfileDTO
{
    public string? Handle { get; set; }
    public string? DisplayName { get; set; }
    public string? Bio { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? Location { get; set; }
    public Guid? AvatarMediaId { get; set; }
    public Guid? BannerMediaId { get; set; }
    public string? ThemeJson { get; set; }
    public bool IsProfilePublic { get; set; } = true;
}
