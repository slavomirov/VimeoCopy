namespace VimeoCopyAPI.Models.DTOs;

/// <summary>
/// What the client asks for when it has a freshly generated hover-preview clip in hand. The content
/// type is the client's because the browser that recorded the clip chose the container — Chrome and
/// Firefox produce WebM, Safari MP4 — and a presigned PUT is only usable if it was signed for the
/// exact type the client will send.
/// </summary>
public class GifUploadRequestDTO
{
    /// <summary>Container of the clip about to be uploaded. Validated against a short allowlist.</summary>
    public string ContentType { get; set; } = default!;
}

/// <summary>Returned when requesting a presigned URL to upload a hover-preview clip.</summary>
public class GifUploadResponseDTO
{
    /// <summary>Pre-signed PUT URL for the clip (key = gif_{MediaId}).</summary>
    public string UploadUrl { get; set; } = default!;

    /// <summary>The media the clip belongs to.</summary>
    public string MediaId { get; set; } = default!;

    /// <summary>
    /// The type the URL was signed for. The client must send exactly this as its Content-Type header
    /// or storage rejects the PUT.
    /// </summary>
    public string ContentType { get; set; } = default!;
}

/// <summary>Result of confirming a stored clip, so the caller can render it without a refetch.</summary>
public class GifConfirmResponseDTO
{
    /// <summary>Unmetered presigned GET URL for the clip that was just stored.</summary>
    public string GifUrl { get; set; } = default!;

    /// <summary>Bytes the stored clip occupies, charged to the owner's quota.</summary>
    public long Size { get; set; }
}
