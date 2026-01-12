using VimeoCopyApi.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IMediaService
{
    public Task<IEnumerable<Media>> GetAllMediaAsync();
    public Task<Media?> GetMediaByIdAsync(string mediaId);
    //public Task<IEnumerable<Media>> GetMediaByIdUserAsync(string userId);
    public Task<GetPresignedURLDTO> GetPresignedURLAsync(string mediaId);
}
