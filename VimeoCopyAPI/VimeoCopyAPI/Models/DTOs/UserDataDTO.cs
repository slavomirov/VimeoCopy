namespace VimeoCopyAPI.Models.DTOs;

public class UserDataDTO
{
    public string Id { get; set; }
    public string Email { get; set; }
    public string Username { get; set; }
    public List<MediaDTO> Media { get; set; }
}

public class MediaDTO
{
    public Guid Id { get; set; }
    public string FileName { get; set; }
    public string ContentType { get; set; }
    public long FileSize { get; set; }
    public DateTime UploadedAt { get; set; }
    public string Status { get; set; }
}
