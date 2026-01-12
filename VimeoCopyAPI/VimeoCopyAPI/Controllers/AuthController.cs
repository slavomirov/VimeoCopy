using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IUserService _userService;

    public AuthController(IUserService userService)
    {
        _userService = userService;
    }

    //[Authorize(Roles = "Admin")]
    //[HttpGet("admin-only")]
    //public IActionResult AdminOnly() //test admin role endpoint
    //{
    //    return Ok("You are admin");
    //}

    //[Authorize(Roles = "User")]
    //[HttpGet("user-only")]
    //public IActionResult UserOnly() //test user role endpoint
    //{
    //    return Ok("You are admin");
    //}

    //[Authorize(Policy = "CanUploadVideos")]
    //[HttpPost("upload")]
    //public IActionResult Upload() //test policy endpoint
    //{
    //    return Ok("You can upload videos");
    //}


    [HttpPost("register")]
    public async Task<IActionResult> Register(UserRegisterDTO input)
    {
        await _userService.RegisterAsync(input);
        return Ok();
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
            return BadRequest(result.ErrorMessage);

        SetRefreshTokenCookie(result.RefreshToken!);

        return Redirect(result.RedirectUrl ?? $"{returnUrl}?accessToken={result.AccessToken}");
    }

    private void SetRefreshTokenCookie(string refreshToken)
    {
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = true, // в dev може да го махнеш ако не си на https
            SameSite = SameSiteMode.Strict,
            Expires = DateTime.UtcNow.AddDays(7)
        };

        Response.Cookies.Append("refreshToken", refreshToken, cookieOptions);
    }
}
