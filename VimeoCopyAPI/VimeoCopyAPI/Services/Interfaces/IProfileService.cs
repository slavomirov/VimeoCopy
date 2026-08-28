using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IProfileService
{
    /// <summary>Public profile by handle. Returns null when missing or not public.</summary>
    Task<PublicProfileDTO?> GetPublicProfileAsync(string handle);

    /// <summary>Search public profiles by handle or display name.</summary>
    Task<IEnumerable<ProfileSearchResultDTO>> SearchProfilesAsync(string query);

    /// <summary>The owner's current editable profile settings.</summary>
    Task<MyProfileDTO?> GetMyProfileAsync(string userId);

    /// <summary>Update the owner's profile. Throws on invalid/taken handle.</summary>
    Task UpdateProfileAsync(string userId, UpdateProfileDTO dto);

    /// <summary>Presigned PUT for an avatar/banner uploaded straight from the owner's device.</summary>
    Task<ProfileImageUploadUrlDTO> CreateProfileImageUploadUrlAsync(string userId, string contentType);

    /// <summary>Records a finished profile-image upload as a private profile asset and attaches it.</summary>
    Task<ProfileImageDTO> ConfirmProfileImageAsync(string userId, ConfirmProfileImageDTO dto);
}
