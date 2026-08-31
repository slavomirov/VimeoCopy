using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface ISharedLinkService
{
    /// <summary>
    /// Creates a temporary share link for a media item. Only the media owner can create one, and
    /// the requested lifetime is clamped to [1, 168] hours.
    /// </summary>
    Task<SharedLink> CreateSharedLinkAsync(string mediaId, string userId, int expirationHours);

    /// <summary>Resolves a token, but only while the link is neither expired nor revoked.</summary>
    Task<SharedLink?> GetValidSharedLinkAsync(string token);

    /// <summary>The owner's currently-usable links for one media item.</summary>
    Task<List<SharedLinkDTO>> GetLinksForMediaAsync(string mediaId, string userId);

    /// <summary>Withdraws a link so the URL stops working immediately.</summary>
    Task RevokeSharedLinkAsync(string token, string userId);
}
