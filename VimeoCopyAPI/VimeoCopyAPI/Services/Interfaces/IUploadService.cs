using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IUploadService
{
    Task<MediaURLDTO> GetMediaURLAsync(string mediaId);
    PresignRequestDTO GetPresignedUrl();
    List<PresignRequestDTO> GetPresignedUrls(int count);
    Task<MediaDTO> UploadCompleteAsync(MediaUploadCompleteDTO input);
}
