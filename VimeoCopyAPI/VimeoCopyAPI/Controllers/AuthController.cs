using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IConfiguration _config;
    private readonly AppDbContext _db;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IConfiguration config,
        AppDbContext db)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _config = config;
        _db = db;
    }


    [Authorize(Roles = "Admin")]
    [HttpGet("admin-only")]
    public IActionResult AdminOnly()
    {
        return Ok("You are admin");
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("user-only")]
    public IActionResult UserOnly()
    {
        return Ok("You are admin");
    }

    [Authorize(Policy = "CanUploadVideos")]
    [HttpPost("upload")]
    public IActionResult Upload()
    {
        return Ok("You can upload videos");
    }


    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        var user = new ApplicationUser
        {
            UserName = req.Email,
            Email = req.Email
        };

        var result = await _userManager.CreateAsync(user, req.Password);

        if (!result.Succeeded)
            return BadRequest(result.Errors);

        // default role
        await _userManager.AddToRoleAsync(user, "User");
        await _userManager.AddClaimAsync(user, new Claim("CanUploadVideos", "true"));
        // по-късно ще добавим email confirmation тук

        return Ok(new { message = "Registered" });
    }


    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var user = await _userManager.FindByEmailAsync(req.Email);
        if (user == null)
            return Unauthorized("Invalid credentials");

        var result = await _signInManager.CheckPasswordSignInAsync(user, req.Password, false);
        if (!result.Succeeded)
            return Unauthorized("Invalid credentials");

        var accessToken = GenerateAccessToken(user);
        var refreshToken = await CreateAndStoreRefreshToken(user);

        SetRefreshTokenCookie(refreshToken);

        return Ok(new { accessToken });
    }


    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh()
    {
        if (!Request.Cookies.TryGetValue("refreshToken", out var token))
            return Unauthorized("No refresh token");

        var refreshToken = await _db.RefreshTokens
            .Include(rt => rt.User)
            .FirstOrDefaultAsync(rt => rt.Token == token);

        if (refreshToken == null || refreshToken.IsRevoked || refreshToken.IsExpired)
            return Unauthorized("Invalid refresh token");

        var user = refreshToken.User;

        // по желание: revoke стария токен и създай нов
        refreshToken.RevokedAt = DateTime.UtcNow;
        var newRefreshToken = await CreateAndStoreRefreshToken(user);

        var accessToken = GenerateAccessToken(user);
        SetRefreshTokenCookie(newRefreshToken);

        await _db.SaveChangesAsync();

        return Ok(new { accessToken });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        if (Request.Cookies.TryGetValue("refreshToken", out var token))
        {
            var refreshToken = await _db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == token);
            if (refreshToken != null)
            {
                refreshToken.RevokedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
        }

        Response.Cookies.Delete("refreshToken");

        return Ok(new { message = "Logged out" });
    }

    private async Task<string> GenerateAccessToken(ApplicationUser user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var userRoles = await _userManager.GetRolesAsync(user);
        var userClaims = await _userManager.GetClaimsAsync(user);

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
           new Claim(JwtRegisteredClaimNames.Email, user.Email)
        };

        // add roles
        claims.AddRange(userRoles.Select(r => new Claim(ClaimTypes.Role, r)));

        // add custom claims
        claims.AddRange(userClaims);

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(15),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }


    private async Task<string> CreateAndStoreRefreshToken(ApplicationUser user)
    {
        var tokenBytes = RandomNumberGenerator.GetBytes(64);
        var token = Convert.ToBase64String(tokenBytes);

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = token,
            ExpiresAt = DateTime.UtcNow.AddDays(7)
        };

        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync();

        return token;
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

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
