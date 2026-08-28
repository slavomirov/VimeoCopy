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

    /// <summary>Vertical crop of the banner as an object-position percentage (0 = top, 100 = bottom).</summary>
    public int BannerOffsetY { get; set; } = 50;

    /// <summary>
    /// True when the signed-in viewer owns this profile. Drives the in-place controls; the JWT
    /// carries no handle claim, so the client cannot work this out on its own.
    /// </summary>
    public bool IsOwner { get; set; }

    /// <summary>Raw theme-token JSON the client applies as CSS variables (null = default theme).</summary>
    public string? ThemeJson { get; set; }

    public List<ProfileWorkDTO> Works { get; set; } = [];

    /// <summary>Projects (albums) that the artist's public works belong to.</summary>
    public List<ProfileAlbumDTO> Albums { get; set; } = [];
}

/// <summary>A project/album surfaced on a public artist profile.</summary>
public class ProfileAlbumDTO
{
    public Guid Id { get; set; }
    public string Title { get; set; } = default!;
    public string? Description { get; set; }

    /// <summary>Number of the artist's public works in this album.</summary>
    public int WorkCount { get; set; }

    /// <summary>Presigned cover image (project thumbnail, else first work's thumbnail/original).</summary>
    public string? CoverUrl { get; set; }
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

    /// <summary>Presigned previews, so the editor can show images the owner can't reach any other
    /// way — a profile-only upload never appears in their media library.</summary>
    public string? AvatarUrl { get; set; }
    public string? BannerUrl { get; set; }

    /// <summary>Vertical crop of the banner as an object-position percentage (0 = top, 100 = bottom).</summary>
    public int BannerOffsetY { get; set; } = 50;

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

    /// <summary>Vertical crop of the banner (0-100). Clamped server-side.</summary>
    public int BannerOffsetY { get; set; } = 50;

    public string? ThemeJson { get; set; }
    public bool IsProfilePublic { get; set; } = true;
}

/// <summary>Asks for a presigned PUT to upload an avatar/banner straight from the owner's device.</summary>
public class ProfileImageUploadRequestDTO
{
    public string ContentType { get; set; } = default!;
}

/// <summary>Where to PUT the file, and the id to confirm it with afterwards.</summary>
public class ProfileImageUploadUrlDTO
{
    public string UploadUrl { get; set; } = default!;
    public Guid MediaId { get; set; }
}

/// <summary>Confirms a finished profile-image upload and attaches it to the profile.</summary>
public class ConfirmProfileImageDTO
{
    public Guid MediaId { get; set; }

    /// <summary>"avatar" or "banner".</summary>
    public string Kind { get; set; } = default!;

    public string ContentType { get; set; } = default!;
    public string? FileName { get; set; }
}

/// <summary>Repositions the banner crop without touching anything else on the profile.</summary>
public class UpdateBannerOffsetDTO
{
    public int BannerOffsetY { get; set; } = 50;
}

/// <summary>The attached profile image plus a presigned preview URL.</summary>
public class ProfileImageDTO
{
    public Guid MediaId { get; set; }
    public string Url { get; set; } = default!;

    /// <summary>The banner crop after the upload — a new banner starts centred.</summary>
    public int BannerOffsetY { get; set; } = 50;
}
