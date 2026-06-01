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
}
