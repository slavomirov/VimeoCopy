using Microsoft.AspNetCore.Authentication;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IUserService
{
    public Task<UserLoginResponseDTO?> RegisterAsync(UserRegisterDTO input);
    public Task<UserLoginResponseDTO?> LoginAsync(UserLoginRequestDTO input);
    public Task<RefreshResultDTO> RefreshAsync(HttpContext context);
    public Task LogoutAsync(HttpContext context);
    AuthenticationProperties GetExternalAuthenticationProperties(string provider, string redirectUrl);
    Task<ExternalLoginResultDTO> HandleExternalLoginCallbackAsync(HttpContext httpContext, string returnUrl = "/");
    public Task<UserDataDTO?> GetUserDataAsync(string userId);
}