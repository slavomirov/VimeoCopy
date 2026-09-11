using VimeoCopyApi.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IMediaService
{
    /// <summary>
    /// One page of the public gallery, with preview URLs already presigned. When <paramref name="mine"/>
    /// is true the page is scoped to the signed-in caller's own media (and requires authentication).
    /// </summary>
    public Task<PagedResultDTO<PublicMediaDTO>> GetAllMediaAsync(int skip = 0, int take = 24, bool mine = false);
    public Task<IEnumerable<Media>> GetUserMediaAsync(string userId);
    public Task<Media?> GetMediaByIdAsync(string mediaId);
    /// <summary>Metered streaming URL. <paramref name="source"/> may be "embed" to attribute the view.</summary>
    public Task<GetPresignedURLDTO> GetPresignedURLAsync(string mediaId, string? source = null);
    /// <summary>Unmetered presigned URL for gallery previews (does not charge bandwidth).</summary>
    public Task<GetPresignedURLDTO> GetPreviewURLAsync(string mediaId);
    public Task DeleteMediaAsync(string mediaId);

    /// <summary>
    /// Deletes any file, regardless of who owns it. Admin-gated at the controller — the ownership
    /// check is skipped here on purpose, which is why it is a separate method from
    /// <see cref="DeleteMediaAsync"/> rather than a flag on it. Bucket cleanup and the owner's
    /// quota refund are identical either way.
    /// </summary>
    public Task DeleteMediaAsAdminAsync(string mediaId);
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

    /// <summary>
    /// Presigned PUT for a hover-preview clip ("GIF generator" output — a short muted video, not an
    /// image/gif). Owner-only, video-only. The content type is the client's because the browser that
    /// recorded the clip chose the container.
    /// </summary>
    public Task<GifUploadResponseDTO> GetGifUploadUrlAsync(string mediaId, string contentType);

    /// <summary>
    /// Confirms a stored clip: reads its real size from the bucket, charges the delta against the
    /// plan quota, and records the key. Returns a presigned URL for the clip just stored.
    /// </summary>
    public Task<GifConfirmResponseDTO> ConfirmGifAsync(string mediaId, string contentType);

    /// <summary>Removes a clip and refunds its bytes; hover falls back to the full file.</summary>
    public Task DeleteGifAsync(string mediaId);

    /// <summary>Owner-only: offer this file for download, or stop offering it. Plan-gated.</summary>
    public Task SetDownloadableAsync(string mediaId, string userId, bool downloadable);

    /// <summary>
    /// Owner-only: pin this file to the top of the public profile, or unpin it. Refuses a private
    /// file (the profile shows nothing else) and refuses to go past the pin cap.
    /// </summary>
    public Task SetPinnedAsync(string mediaId, string userId, bool pinned);

    /// <summary>Whether this user's plan includes file downloads.</summary>
    public Task<bool> PlanAllowsDownloadsAsync(string userId);

    /// <summary>
    /// Metered presigned URL that saves the original file. Requires the file to be flagged
    /// downloadable AND the owner's plan to allow downloads.
    /// </summary>
    public Task<GetPresignedURLDTO> GetDownloadUrlAsync(string mediaId);
}
