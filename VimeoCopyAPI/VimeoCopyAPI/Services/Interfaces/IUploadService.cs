using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IUploadService
{
    Task<MediaURLDTO> GetMediaURLAsync(string mediaId);
    PresignRequestDTO GetPresignedUrl();
    Task<MediaDTO> UploadCompleteAsync(MediaUploadCompleteDTO input);
}
