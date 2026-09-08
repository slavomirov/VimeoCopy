namespace VimeoCopyAPI.Models.DTOs;

public class MediaUploadCompleteDTO
{
    public string MediaId { get; set; }
    public long FileSize { get; set; }
    public string ContentType { get; set; }
    public bool IsPublic { get; set; } = true;

    /// <summary>Original file name from the client.</summary>
    public string? FileName { get; set; }

    /// <summary>True if the client uploaded a thumbnail to thumb_{MediaId}.</summary>
    public bool HasThumbnail { get; set; }

    /// <summary>
    /// Optional description written while the upload was still queued. Free text: trimmed and
    /// capped to the column width server-side, exactly like <see cref="FileName"/>.
    /// </summary>
    public string? Description { get; set; }

    /// <summary>
    /// Whether the media is listed on the public Media Gallery. Defaults to true to match the
    /// column default, so an older client that omits it keeps the previous behaviour.
    /// </summary>
    public bool ShowOnMediaPage { get; set; } = true;

    /// <summary>
    /// Owner opting the file into downloads at upload time. Honoured only while their plan allows
    /// downloads — the same two-gate rule the dashboard toggle goes through.
    /// </summary>
    public bool Downloadable { get; set; }

    /// <summary>Optional: automatically add the uploaded media to this project.</summary>
    public Guid? ProjectId { get; set; }
}
