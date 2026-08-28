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

        /// <summary>Bytes per megabyte (binary). Storage/bandwidth are stored in bytes; plan limits are in MB.</summary>
        public const long BytesPerMb = 1024L * 1024L;

        /// <summary>Length of a bandwidth billing cycle before UsedBandwidth resets.</summary>
        public static readonly TimeSpan BandwidthCycleLength = TimeSpan.FromDays(30);

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

            // Generic message — don't reveal whether an email is already registered (user enumeration).
            if (user is not null)
                throw new Exception("Unable to register with the provided details.");

            user = new ApplicationUser
            {
                UserName = input.Email,
                Email = input.Email
            };

            var result = await _userManager.CreateAsync(user, input.Password);

            if (!result.Succeeded)
                throw new Exception(result.Errors.Select(x => x.Description).FirstOrDefault());

            await _userManager.AddToRoleAsync(user, "User"); //default 
            await AssignPlanToUserAsync(user.Id, "Free");

            return await LoginAsync(new() { Email = input.Email, Password = input.Password });
        }

        public async Task<UserLoginResponseDTO?> LoginAsync(UserLoginRequestDTO input)
        {
            var user = await _userManager.FindByEmailAsync(input.Email) ?? throw new Exception("Invalid credentials");

            var result = await _signInManager.CheckPasswordSignInAsync(user, input.Password, lockoutOnFailure: true);
            if (result.IsLockedOut)
                throw new Exception("Account temporarily locked due to too many failed attempts. Please try again later.");
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

            // The deletion cookie has to carry the same attributes the cookie was written with,
            // or the browser rejects it in this cross-site setup and refreshToken outlives logout.
            context.Response.Cookies.Delete("refreshToken", new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.None,
                Path = "/"
            });

            // External (Google) sign-in runs through SignInManager.SignInAsync, which issues an
            // Identity application cookie of its own. Without this, part of the session survives.
            await _signInManager.SignOutAsync();
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

            // Lazily roll the bandwidth cycle so the dashboard reflects a fresh allowance.
            if (RollBandwidthCycleIfDue(user))
                await _dbContext.SaveChangesAsync();

            var usedMemory = user.UsedMemory ?? 0;
            var buyedMemory = user.BuyedMemory;
            var freeMemory = buyedMemory.HasValue ? (long?)Math.Max(0, buyedMemory.Value - usedMemory) : null;

            var usedBandwidth = user.UsedBandwidth ?? 0;
            var buyedBandwidth = user.BuyedBandwidth;
            var freeBandwidth = buyedBandwidth.HasValue ? (long?)Math.Max(0, buyedBandwidth.Value - usedBandwidth) : null;

            return new UserDataDTO
            {
                Id = user.Id,
                Email = user.Email,
                Username = user.UserName,
                BuyedMemory = buyedMemory,
                UsedMemory = usedMemory,
                FreeMemory = freeMemory,
                BuyedBandwidth = buyedBandwidth,
                UsedBandwidth = usedBandwidth,
                FreeBandwidth = freeBandwidth,
                PlanExpiration = user.PlanExpiration,
                PlanName = user.Plan?.Name,
                PlanDescription = user.Plan?.Description,
                Media = [.. user.Media.Where(m => !m.IsProfileAsset).Select(m => new MediaDTO
                {
                    Id = m.Id,
                    ContentType = m.ContentType,
                    FileSize = m.FileSize,
                    UploadedAt = m.UploadedAt,
                    Status = m.Status,
                    IsPublic = m.IsPublic,
                    HasThumbnail = !string.IsNullOrEmpty(m.ThumbnailUrl),
                    ShowOnMediaPage = m.ShowOnMediaPage,
                    Description = m.Description,
                    FileName = m.FileName,
                })]
            };
        }

        public async Task IncreaseUsedMemoryAsync(string userId, long mediaSize)
            => await _dbContext.Users.Where(u => u.Id == userId)
                .ExecuteUpdateAsync(u => u.SetProperty(user => user.UsedMemory, user => (user.UsedMemory ?? 0) + mediaSize));

        public async Task DecreaseUsedMemoryAsync(string userId, long mediaSize)
            => await _dbContext.Users
                .Where(u => u.Id == userId)
                .ExecuteUpdateAsync(u => u
                    .SetProperty(
                        user => user.UsedMemory,
                        user => (user.UsedMemory ?? 0) - mediaSize < 0
                            ? 0
                            : (user.UsedMemory ?? 0) - mediaSize
                    )
                );

        public async Task IncreaseUsedBandwidthAsync(string userId, long bytes)
            => await _dbContext.Users.Where(u => u.Id == userId)
                .ExecuteUpdateAsync(u => u.SetProperty(user => user.UsedBandwidth, user => (user.UsedBandwidth ?? 0) + bytes));

        /// <summary>
        /// Resets UsedBandwidth to 0 when the current cycle has rolled over (≥ <see cref="BandwidthCycleLength"/>).
        /// Mutates the tracked entity; the caller is responsible for persisting. Returns true when a reset occurred.
        /// </summary>
        public static bool RollBandwidthCycleIfDue(ApplicationUser user)
        {
            if (user.BuyedBandwidth is null) return false; // no active plan to meter
            var start = user.BandwidthCycleStart ?? user.CreatedAt;
            if (DateTime.UtcNow - start < BandwidthCycleLength) return false;

            user.UsedBandwidth = 0;
            user.BandwidthCycleStart = DateTime.UtcNow;
            user.BandwidthOverageNotifiedAt = null;
            return true;
        }


        public async Task AssignPlanToUserAsync(string userId, string planName)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId) ?? throw new Exception("User not found");
            var plan = await _dbContext.Plans.FirstOrDefaultAsync(p => p.Name == planName) ?? throw new Exception("Plan not found");

            user.PlanId = plan.Id;
            user.BuyedMemory = plan.StorageLimitMB * BytesPerMb;
            user.BuyedBandwidth = plan.BandwidthMB * BytesPerMb;
            user.UsedBandwidth = 0;
            user.BandwidthCycleStart = DateTime.UtcNow;
            user.BandwidthOverageNotifiedAt = null;
            user.PlanExpiration = planName == "Free" ? DateTime.UtcNow.AddDays(7) : DateTime.UtcNow.AddMonths(1);
            _dbContext.Users.Update(user);
            await _dbContext.SaveChangesAsync();
        }

        public async Task UnassingPlanFromUserAsync(string userId)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId) ?? throw new Exception("User not found");
            user.PlanId = null;
            user.BuyedMemory = null;
            user.PlanExpiration = null;
            user.BuyedBandwidth = null;
            user.UsedBandwidth = null;
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
            // UsedMemory, BuyedMemory and fileSize are all in bytes.
            if ((user.UsedMemory ?? 0) + fileSize > user.BuyedMemory)
                return "User doesn't have enough storage!";

            return "Yes";
        }
    }
}