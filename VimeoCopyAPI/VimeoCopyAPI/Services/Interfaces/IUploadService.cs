using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IUploadService
{
    IReadOnlyCollection<string> AllowedContentTypes { get; }
    Task<PresignRequestDTO> GetPresignedUrlAsync(string contentType);
    /// <summary>One presigned URL per requested content type — a batch may mix images, video and audio.</summary>
    Task<List<PresignRequestDTO>> GetPresignedUrlsAsync(IReadOnlyList<string> contentTypes);
    Task<MediaDTO> UploadCompleteAsync(MediaUploadCompleteDTO input);
}
