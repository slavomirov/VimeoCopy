namespace VimeoCopyAPI.Models.DTOs;

public class GetPresignedURLDTO
{
    public string Url { get; set; }
    public string ContentType { get; set; }
    public string? ThumbnailUrl { get; set; }

    /// <summary>Unmetered URL of the hover-preview clip, or null when the media has no clip.</summary>
    public string? GifUrl { get; set; }
}
