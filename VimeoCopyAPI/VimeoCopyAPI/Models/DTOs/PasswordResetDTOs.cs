using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models.DTOs;

/// <summary>Step 1 — ask for a code to be emailed.</summary>
public class ForgotPasswordRequestDTO
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
}

/// <summary>Step 2 — prove you received the emailed code.</summary>
public class VerifyResetCodeRequestDTO
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, StringLength(6, MinimumLength = 6)]
    public string Code { get; set; } = string.Empty;
}

/// <summary>Step 3 — set the new password using the ticket from step 2.</summary>
public class ResetPasswordRequestDTO
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Ticket { get; set; } = string.Empty;

    [Required]
    public string NewPassword { get; set; } = string.Empty;
}

public record VerifyResetCodeResultDTO(
    bool Success,
    string? Ticket = null,
    DateTime? TicketExpiresAt = null,
    string? ErrorMessage = null);

public record ResetPasswordResultDTO(
    bool Success,
    string? AccessToken = null,
    string? RefreshToken = null,
    string? ErrorMessage = null);
