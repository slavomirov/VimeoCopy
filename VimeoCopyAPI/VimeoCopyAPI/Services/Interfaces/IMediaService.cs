using VimeoCopyApi.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IMediaService
{
    /// <summary>One page of the public gallery, with preview URLs already presigned.</summary>
    public Task<PagedResultDTO<PublicMediaDTO>> GetAllMediaAsync(int skip = 0, int take = 24);
    public Task<IEnumerable<Media>> GetUserMediaAsync(string userId);
    public Task<Media?> GetMediaByIdAsync(string mediaId);
    /// <summary>Metered streaming URL. <paramref name="source"/> may be "embed" to attribute the view.</summary>
    public Task<GetPresignedURLDTO> GetPresignedURLAsync(string mediaId, string? source = null);
    /// <summary>Unmetered presigned URL for gallery previews (does not charge bandwidth).</summary>
    public Task<GetPresignedURLDTO> GetPreviewURLAsync(string mediaId);
    public Task DeleteMediaAsync(string mediaId);
    public Task ToggleVisibilityAsync(string mediaId, string userId);
    public Task UpdateMediaDetailsAsync(string mediaId, string userId, UpdateMediaDetailsDTO dto);
    /// <summary>
    /// Returns a pre-signed PUT URL for uploading a new thumbnail for the given media.
    /// Only the owner can call this.
    /// </summary>
    public Task<ThumbnailUploadResponseDTO> GetThumbnailUploadUrlAsync(string mediaId);
    /// <summary>
    /// Confirms a new thumbnail has been uploaded: verifies its real size against the plan quota,
    /// then writes the ThumbnailUrl column.
    /// </summary>
    public Task ConfirmThumbnailAsync(string mediaId);
}
