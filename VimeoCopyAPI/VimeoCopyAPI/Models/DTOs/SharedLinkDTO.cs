namespace VimeoCopyAPI.Models.DTOs;

/// <summary>An active share link as shown to its owner.</summary>
public class SharedLinkDTO
{
    public string Token { get; set; } = default!;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
}
