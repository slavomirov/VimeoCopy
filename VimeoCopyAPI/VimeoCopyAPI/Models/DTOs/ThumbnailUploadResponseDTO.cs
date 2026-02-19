namespace VimeoCopyAPI.Models.DTOs;

/// <summary>
/// Returned when requesting a presigned URL to upload a new/replacement thumbnail.
/// </summary>
public class ThumbnailUploadResponseDTO
{
    /// <summary>Pre-signed PUT URL for uploading the thumbnail JPEG.</summary>
    public string UploadUrl { get; set; } = default!;

    /// <summary>The media id the thumbnail belongs to.</summary>
    public string MediaId { get; set; } = default!;
}
