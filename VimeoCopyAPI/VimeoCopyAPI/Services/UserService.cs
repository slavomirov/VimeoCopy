using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services
{
    public record RefreshResultDTO(string? AccessToken, string? RefreshToken, bool IsUnauthorized = false, string? ErrorMessage = null);

    public class UserService : IUserService
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly IConfiguration _config;
        private readonly AppDbContext _dbContext;

        public UserService(
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            IConfiguration config,
            AppDbContext db)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _config = config;
            _dbContext = db;
        }

        public async Task<UserLoginResponseDTO?> RegisterAsync(UserRegisterDTO input)
        {
            var user = await _userManager.FindByEmailAsync(input.Email);

            if (user is not null)
                throw new Exception("User already exists");

            user = new ApplicationUser
            {
                UserName = input.Email,
                Email = input.Email
            };

            var result = await _userManager.CreateAsync(user, input.Password);

            if (!result.Succeeded)
                throw new Exception(result.Errors.Select(x => x.Description).FirstOrDefault());

            await _userManager.AddToRoleAsync(user, "User"); //default 
            await AssignPlanToUserAsync(user.Id, "free");

            return await LoginAsync(new() { Email = input.Email, Password = input.Password });
        }

        public async Task<UserLoginResponseDTO?> LoginAsync(UserLoginRequestDTO input)
        {
            var user = await _userManager.FindByEmailAsync(input.Email) ?? throw new Exception("Invalid credentials");

            var result = await _signInManager.CheckPasswordSignInAsync(user, input.Password, false);
            if (!result.Succeeded)
                throw new Exception("Invalid credentials");

            var accessToken = await GenerateAccessTokenAsync(user);
            var refreshToken = await CreateAndStoreRefreshTokenAsync(user);

            return new() { AccessToken = accessToken, RefreshToken = refreshToken };
        }

        public async Task<RefreshResultDTO> RefreshAsync(HttpContext context)
        {
            if (!context.Request.Cookies.TryGetValue("refreshToken", out var token))
                return new RefreshResultDTO(null, null, IsUnauthorized: true, ErrorMessage: "No refresh token");

            var refreshToken = await _dbContext.RefreshTokens
                .Include(rt => rt.User)
                .FirstOrDefaultAsync(rt => rt.Token == token);

            if (refreshToken == null || refreshToken.IsRevoked || refreshToken.IsExpired)
                return new RefreshResultDTO(null, null, IsUnauthorized: true, ErrorMessage: "Invalid refresh token");

            var user = refreshToken.User;

            refreshToken.RevokedAt = DateTime.UtcNow;
            var newRefreshToken = await CreateAndStoreRefreshTokenAsync(user);

            var accessToken = await GenerateAccessTokenAsync(user);

            SetRefreshTokenCookie(context.Response, newRefreshToken);

            await _dbContext.SaveChangesAsync();

            return new RefreshResultDTO(accessToken, newRefreshToken);
        }

        public async Task LogoutAsync(HttpContext context)
        {
            if (context.Request.Cookies.TryGetValue("refreshToken", out var token))
            {
                var refreshToken = await _dbContext.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == token);
                if (refreshToken != null)
                {
                    refreshToken.RevokedAt = DateTime.UtcNow;
                    await _dbContext.SaveChangesAsync();
                }
            }

            context.Response.Cookies.Delete("refreshToken");
        }

        public AuthenticationProperties GetExternalAuthenticationProperties(string provider, string redirectUrl)
            => _signInManager.ConfigureExternalAuthenticationProperties(provider, redirectUrl);

        public async Task<ExternalLoginResultDTO> HandleExternalLoginCallbackAsync(HttpContext httpContext, string returnUrl = "/")
{
    var info = await _signInManager.GetExternalLoginInfoAsync();
    if (info == null)
        return new ExternalLoginResultDTO { Success = false, ErrorMessage = "External login info not found" };

    var email = info.Principal.FindFirstValue(ClaimTypes.Email);
    if (string.IsNullOrEmpty(email))
        return new ExternalLoginResultDTO { Success = false, ErrorMessage = "Email not provided by external provider" };

    // 1) Проверяваме дали login вече е вързан към потребител
    var loginUser = await _userManager.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
    if (loginUser != null)
    {
        // директно логваме
        await _signInManager.SignInAsync(loginUser, false);

        var access = await GenerateAccessTokenAsync(loginUser);
        var refresh = await CreateAndStoreRefreshTokenAsync(loginUser);

        return new ExternalLoginResultDTO
        {
            Success = true,
            AccessToken = access,
            RefreshToken = refresh,
            RedirectUrl = $"{returnUrl}?accessToken={access}"
        };
    }

    // 2) Login не е вързан → проверяваме дали има потребител с този email
    var user = await _userManager.FindByEmailAsync(email);

    if (user == null)
    {
        // 3) Няма потребител → създаваме нов
        user = new ApplicationUser
        {
            Email = email,
            UserName = email,
            EmailConfirmed = true
        };

        var createResult = await _userManager.CreateAsync(user);
        if (!createResult.Succeeded)
        {
            var err = createResult.Errors.FirstOrDefault()?.Description ?? "User creation failed";
            return new ExternalLoginResultDTO { Success = false, ErrorMessage = err };
        }

        await _userManager.AddToRoleAsync(user, "User");
    }

    // 4) Връзваме външния login към акаунта
    var addLoginResult = await _userManager.AddLoginAsync(user, info);
    if (!addLoginResult.Succeeded)
    {
        var err = addLoginResult.Errors.FirstOrDefault()?.Description ?? "Could not link external login";
        return new ExternalLoginResultDTO { Success = false, ErrorMessage = err };
    }

    // 5) Логваме потребителя
    await _signInManager.SignInAsync(user, false);

    var accessToken = await GenerateAccessTokenAsync(user);
    var refreshToken = await CreateAndStoreRefreshTokenAsync(user);

    return new ExternalLoginResultDTO
    {
        Success = true,
        AccessToken = accessToken,
        RefreshToken = refreshToken,
        RedirectUrl = $"{returnUrl}?accessToken={accessToken}"
    };
}


        private async Task<string> GenerateAccessTokenAsync(ApplicationUser user)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var userRoles = await _userManager.GetRolesAsync(user);
            var userClaims = await _userManager.GetClaimsAsync(user);

            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, user.Id),
                new(JwtRegisteredClaimNames.Email, user.Email!)
            };

            claims.AddRange(userRoles.Select(r => new Claim(ClaimTypes.Role, r)));
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

        private async Task<string> CreateAndStoreRefreshTokenAsync(ApplicationUser user)
        {
            var tokenBytes = RandomNumberGenerator.GetBytes(64);
            var token = Convert.ToBase64String(tokenBytes);

            var refreshToken = new RefreshToken
            {
                UserId = user.Id,
                Token = token,
                ExpiresAt = DateTime.UtcNow.AddDays(1)
            };

            _dbContext.RefreshTokens.Add(refreshToken);
            await _dbContext.SaveChangesAsync();

            return token;
        }

        private static void SetRefreshTokenCookie(HttpResponse response, string refreshToken)
        {
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.None,
                Expires = DateTime.UtcNow.AddDays(1)
            };

            response.Cookies.Append("refreshToken", refreshToken, cookieOptions);
        }

        public async Task<UserDataDTO?> GetUserDataAsync(string userId)
        {
            var user = await _dbContext.Users
                .Include(u => u.Media)
                .Include(u => u.Plan)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null) return null;

            var usedMemory = user.UsedMemory ?? 0;
            var buyedMemory = user.BuyedMemory;
            var freeMemory = buyedMemory.HasValue ? (long?)Math.Max(0, buyedMemory.Value - usedMemory) : null;

            return new UserDataDTO
            {
                Id = user.Id,
                Email = user.Email,
                Username = user.UserName,
                BuyedMemory = buyedMemory,
                UsedMemory = usedMemory,
                FreeMemory = freeMemory,
                PlanExpiration = user.PlanExpiration,
                PlanName = user.Plan?.Name,
                PlanDescription = user.Plan?.Description,
                Media = [.. user.Media.Select(m => new MediaDTO
                {
                    Id = m.Id,
                    ContentType = m.ContentType,
                    FileSize = m.FileSize,
                    UploadedAt = m.UploadedAt,
                    Status = m.Status
                })]
            };
        }

        public async Task IncreaseUsedMemoryAsync(string userId, long mediaSize)
            => await _dbContext.Users.Where(u => u.Id == userId)
                .ExecuteUpdateAsync(u => u.SetProperty(user => user.UsedMemory, user => user.UsedMemory + mediaSize));

        public async Task DecreaseUsedMemoryAsync(string userId, long mediaSize)
            => await _dbContext.Users.Where(u => u.Id == userId)
                .ExecuteUpdateAsync(u => u.SetProperty(user => user.UsedMemory, user => Math.Max(0, (user.UsedMemory ?? 0) - mediaSize)));

        public async Task AssignPlanToUserAsync(string userId, string planName)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId) ?? throw new Exception("User not found");
            var plan = await _dbContext.Plans.FirstOrDefaultAsync(p => p.Name == planName) ?? throw new Exception("Plan not found");

            user.PlanId = plan.Id;
            user.BuyedMemory = plan.StorageLimitInBytes;
            user.PlanExpiration = planName == "free" ? DateTime.UtcNow.AddDays(1) : DateTime.UtcNow.AddMonths(1);
            _dbContext.Users.Update(user);
            await _dbContext.SaveChangesAsync();
        }

        public async Task UnassingPlanFromUserAsync(string userId)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId) ?? throw new Exception("User not found");
            user.PlanId = null;
            user.BuyedMemory = null;
            user.PlanExpiration = null;
            _dbContext.Users.Update(user);
            await _dbContext.SaveChangesAsync();
        }

        public async Task<string> CanUserUploadAsync(string userId, long fileSize)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId) ?? throw new Exception("User not found");

            if (user.BuyedMemory is null || user.PlanId is null)
                return "User doesn't have plan!";
            if (user.PlanExpiration < DateTime.UtcNow)
            {
                await UnassingPlanFromUserAsync(userId);
                return "User's plan has expired!";
            }
            if ((user.UsedMemory ?? 0) + fileSize > user.BuyedMemory)
                return "Yes";

            return "User doesn't have enough storage!";
        }

    }
}