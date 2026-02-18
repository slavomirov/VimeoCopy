using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Services.Interfaces;

public interface ISharedLinkService
{
    /// <summary>
    /// Creates a temporary share link for a media item.
    /// Only the media owner can create a share link.
    /// </summary>
    Task<SharedLink> CreateSharedLinkAsync(string mediaId, string userId, int expirationHours);

    /// <summary>
    /// Resolves a token to the shared link (including media), 
    /// only if the link has not expired.
    /// </summary>
    Task<SharedLink?> GetValidSharedLinkAsync(string token);
}
