namespace VimeoCopyApi.Models;

public class UploadCompleteRequest
{
    public string FileName { get; set; }
    public long FileSize { get; set; }
    public string ContentType { get; set; }
}
