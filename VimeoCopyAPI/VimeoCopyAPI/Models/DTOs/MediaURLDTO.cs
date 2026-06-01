namespace VimeoCopyAPI.Models.DTOs;

public class MediaURLDTO
{
    public Guid MediaId { get; set; }
    public string Url { get; set; }
    public string ContentType { get; set; }
    public string? ThumbnailUrl { get; set; }
}
