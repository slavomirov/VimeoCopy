namespace VimeoCopyAPI.Models.DTOs;

public class ExternalLoginResultDTO
{
    public bool Success { get; init; }
    public string? AccessToken { get; init; }
    public string? RefreshToken { get; init; }
    public string? ErrorMessage { get; init; }
    public string? RedirectUrl { get; init; }
}


