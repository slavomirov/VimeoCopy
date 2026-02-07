namespace VimeoCopyAPI.Models.DTOs;

public class MediaUploadCompleteDTO
{
    public string MediaId { get; set; }
    public long FileSize { get; set; }
    public string ContentType { get; set; }
}
