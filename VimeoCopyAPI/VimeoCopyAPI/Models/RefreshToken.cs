using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

public class RefreshToken
{
    public int Id { get; set; }
    public string UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;

    /// <summary>
    /// SHA-256 (hex) of the token handed to the browser — never the token itself. Read access to
    /// this table used to be enough to impersonate any user for the lifetime of their session.
    /// </summary>
    [MaxLength(64)]
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }
    public bool IsRevoked => RevokedAt != null;
    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
}
