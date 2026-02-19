using VimeoCopyApi.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IMediaService
{
    public Task<IEnumerable<Media>> GetAllMediaAsync();
    public Task<IEnumerable<Media>> GetUserMediaAsync(string userId);
    public Task<Media?> GetMediaByIdAsync(string mediaId);
    //public Task<IEnumerable<Media>> GetMediaByIdUserAsync(string userId);
    public Task<GetPresignedURLDTO> GetPresignedURLAsync(string mediaId);
    public Task DeleteMediaAsync(string fileName);
    public Task ToggleVisibilityAsync(string mediaId, string userId);
    /// <summary>
    /// Returns a pre-signed PUT URL for uploading a new thumbnail for the given media.
    /// Only the owner can call this.
    /// </summary>
    public Task<ThumbnailUploadResponseDTO> GetThumbnailUploadUrlAsync(string mediaId);
    /// <summary>
    /// Confirms that a new thumbnail has been uploaded, writing the ThumbnailUrl column.
    /// </summary>
    public Task ConfirmThumbnailAsync(string mediaId);
}
