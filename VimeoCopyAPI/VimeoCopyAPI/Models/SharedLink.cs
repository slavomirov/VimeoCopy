using System.ComponentModel.DataAnnotations;
using VimeoCopyApi.Models;

namespace VimeoCopyAPI.Models;

public class SharedLink
{
    [Key]
    public Guid Id { get; set; }

    /// <summary>
    /// Short unique token used in the shareable URL.
    /// </summary>
    [Required]
    [MaxLength(64)]
    public string Token { get; set; } = default!;

    [Required]
    public Guid MediaId { get; set; }
    public Media Media { get; set; } = default!;

    /// <summary>
    /// The user who created the shared link.
    /// </summary>
    [Required]
    public string CreatedByUserId { get; set; } = default!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When this link expires and can no longer be used.
    /// </summary>
    [Required]
    public DateTime ExpiresAt { get; set; }

    /// <summary>
    /// Set when the owner withdraws the link. Until this existed a share could not be taken back:
    /// the only way to kill a leaked URL was to delete the media it pointed at.
    /// </summary>
    public DateTime? RevokedAt { get; set; }

    public bool IsRevoked => RevokedAt != null;
    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
}
