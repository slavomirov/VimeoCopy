namespace VimeoCopyAPI.Models;

public class RefreshToken
{
    public int Id { get; set; }
    public string UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }
    public bool IsRevoked => RevokedAt != null;
    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
}
