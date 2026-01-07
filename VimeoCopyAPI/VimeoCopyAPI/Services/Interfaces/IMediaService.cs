using VimeoCopyApi.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IMediaService
{
    public Task<IEnumerable<Media>> GetAllMediaAsync();
    public Task<Media?> GetMediaByIdAsync(Guid mediaId);
    public Task<GetPresignedURLDTO> GetPresignedURLAsync(Guid mediaId);
}
