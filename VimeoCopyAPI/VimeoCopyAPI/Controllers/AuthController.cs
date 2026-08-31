using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly IUserService _userService;

    public AuthController(IUserService userService)
    {
        _userService = userService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(UserRegisterDTO input)
    {
        var result = await _userService.RegisterAsync(input);

        SetRefreshTokenCookie(result!.RefreshToken); //move to the service ???

        return Ok(new { result.AccessToken });
    }


    [HttpPost("login")]
    public async Task<IActionResult> Login(UserLoginRequestDTO input)
    {
        var result = await _userService.LoginAsync(input);

        SetRefreshTokenCookie(result!.RefreshToken); //move to the service ???

        return Ok(new { result.AccessToken });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh()
    {
        var result = await _userService.RefreshAsync(HttpContext);

        if (result.IsUnauthorized)
            return Unauthorized(new { error = result.ErrorMessage });

        return Ok(new { accessToken = result.AccessToken });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await _userService.LogoutAsync(HttpContext);
        return Ok(new { message = "Logged out" });
    }

    // ── Forgot password ────────────────────────────────────────────────────────────────────────
    // Step 1 emails a code, step 2 trades the code for a ticket, step 3 sets the password.

    /// <summary>Emails a short-lived reset code. Always answers the same, whatever the address.</summary>
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequestDTO input)
    {
        await _userService.RequestPasswordResetAsync(input.Email);

        // Deliberately unconditional: a different response for unknown emails would turn this
        // endpoint into an account-enumeration oracle.
        return Ok(new
        {
            message = "If an account exists for that email, we've sent a reset code.",
            expiresInSeconds = (int)UserService.PasswordResetCodeLifetime.TotalSeconds,
            resendAfterSeconds = (int)UserService.PasswordResetResendCooldown.TotalSeconds
        });
    }

    /// <summary>Validates the emailed code and returns the ticket the reset step needs.</summary>
    [HttpPost("verify-reset-code")]
    public async Task<IActionResult> VerifyResetCode(VerifyResetCodeRequestDTO input)
    {
        var result = await _userService.VerifyPasswordResetCodeAsync(input.Email, input.Code);

        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { ticket = result.Ticket, ticketExpiresAt = result.TicketExpiresAt });
    }

    /// <summary>Sets the new password against a verified ticket and signs the user in.</summary>
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequestDTO input)
    {
        var result = await _userService.ResetPasswordAsync(input.Email, input.Ticket, input.NewPassword);

        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        SetRefreshTokenCookie(result.RefreshToken!);

        return Ok(new { accessToken = result.AccessToken, message = "Password updated." });
    }

    [HttpGet("external-login")]
    public IActionResult ExternalLogin(string provider, string returnUrl = "/")
    {
        var redirectUrl = Url.Action("ExternalLoginCallback", "Auth", new { returnUrl }, Request.Scheme);
        var properties = _userService.GetExternalAuthenticationProperties(provider, redirectUrl);
        return Challenge(properties, provider);
    }

    [HttpGet("external-login-callback")]
    public async Task<IActionResult> ExternalLoginCallback(string returnUrl = "/")
    {
        var result = await _userService.HandleExternalLoginCallbackAsync(HttpContext, returnUrl);

        if (!result.Success)
        {
            var separator = returnUrl.Contains('?') ? "&" : "?";
            var encodedError = Uri.EscapeDataString(result.ErrorMessage ?? "External login failed");
            return Redirect($"{returnUrl}{separator}error={encodedError}");
        }

        SetRefreshTokenCookie(result.RefreshToken!);

        return Redirect(result.RedirectUrl ?? $"{returnUrl}?accessToken={result.AccessToken}");
    }

    private void SetRefreshTokenCookie(string refreshToken)
    {
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = true, // в dev може да го махнеш ако не си на https
            SameSite = SameSiteMode.None,
            Expires = DateTime.UtcNow.AddDays(7)
        };

        Response.Cookies.Append("refreshToken", refreshToken, cookieOptions);
    }
}
