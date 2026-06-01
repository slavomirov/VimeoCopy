namespace VimeoCopyAPI.Models.DTOs;

public class GetPresignedURLDTO
{
    public string Url { get; set; }
    public string ContentType { get; set; }
    public string? ThumbnailUrl { get; set; }
}
