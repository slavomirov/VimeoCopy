using Microsoft.AspNetCore.Authentication;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IUserService
{
    Task<UserLoginResponseDTO?> RegisterAsync(UserRegisterDTO input);
    Task<UserLoginResponseDTO?> LoginAsync(UserLoginRequestDTO input);
    Task<RefreshResultDTO> RefreshAsync(HttpContext context);
    Task LogoutAsync(HttpContext context);
    AuthenticationProperties GetExternalAuthenticationProperties(string provider, string redirectUrl);
    Task<ExternalLoginResultDTO> HandleExternalLoginCallbackAsync(HttpContext httpContext, string returnUrl = "/");
    Task<UserDataDTO?> GetUserDataAsync(string userId);
    Task IncreaseUsedMemoryAsync(string userId, long mediaSize);
    Task AssignPlanToUserAsync(string userId, string planName);
    Task DecreaseUsedMemoryAsync(string userId, long mediaSize);
    Task<string> CanUserUploadAsync(string userId, long fileSize);

}