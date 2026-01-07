using VimeoCopyApi.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IUploadService
{
    public string GetPresignedUrl(string fileName);
    public Task<Media> UploadCompleteAsync(MediaUploadCompleteDTO input);
    public Task<MediaURLDTO> GetMediaURLAsync(Guid mediaId);
}
