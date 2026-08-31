using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

/// <summary>
/// A one-time "forgot password" challenge. The 6-digit code is emailed to the user and is only
/// ever stored hashed, so a database leak can't be replayed. Once the code is verified we swap it
/// for a longer, higher-entropy ticket: the short code only has to survive the 2 minutes it takes
/// to read an email, while the ticket carries the authorisation through the set-password step.
/// </summary>
public class PasswordResetCode
{
    public int Id { get; set; }

    public string UserId { get; set; } = default!;
    public ApplicationUser User { get; set; } = default!;

    /// <summary>SHA-256 (hex) of the emailed code. Never store the code itself.</summary>
    [MaxLength(64)]
    public string CodeHash { get; set; } = string.Empty;

    /// <summary>SHA-256 (hex) of the ticket issued once the code is verified. Null until then.</summary>
    [MaxLength(64)]
    public string? TicketHash { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the emailed code stops working (CreatedAt + 2 minutes).</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>When the ticket stops working. Null until the code is verified.</summary>
    public DateTime? TicketExpiresAt { get; set; }

    /// <summary>Set when the password is actually changed. A consumed row can never be reused.</summary>
    public DateTime? ConsumedAt { get; set; }

    /// <summary>Wrong-code guesses. Caps brute force against a 6-digit space inside the 2-minute window.</summary>
    public int Attempts { get; set; }
}
