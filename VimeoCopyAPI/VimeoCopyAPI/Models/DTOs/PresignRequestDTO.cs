namespace VimeoCopyAPI.Models.DTOs;

public class PresignRequestDTO
{
    public string Url { get; set; }
    public string MediaId { get; set; }
    /// <summary>Presigned PUT URL for uploading the thumbnail (key = thumb_{MediaId}).</summary>
    public string ThumbnailUploadUrl { get; set; }
}
