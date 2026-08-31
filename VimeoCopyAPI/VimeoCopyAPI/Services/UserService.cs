using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
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
        private readonly IEmailService _emailService;
        private readonly ILogger<UserService> _logger;

        /// <summary>Bytes per megabyte (binary). Storage/bandwidth are stored in bytes; plan limits are in MB.</summary>
        public const long BytesPerMb = 1024L * 1024L;

        /// <summary>Length of a bandwidth billing cycle before UsedBandwidth resets.</summary>
        public static readonly TimeSpan BandwidthCycleLength = TimeSpan.FromDays(30);

        /// <summary>How long an emailed password-reset code stays usable.</summary>
        public static readonly TimeSpan PasswordResetCodeLifetime = TimeSpan.FromMinutes(2);

        /// <summary>How long the post-verification ticket lasts — enough to pick a good password.</summary>
        public static readonly TimeSpan PasswordResetTicketLifetime = TimeSpan.FromMinutes(10);

        /// <summary>Minimum gap between reset emails for one account (blunts mailbox flooding).</summary>
        public static readonly TimeSpan PasswordResetResendCooldown = TimeSpan.FromSeconds(60);

        /// <summary>Wrong guesses allowed per code before it is burned.</summary>
        public const int PasswordResetMaxAttempts = 5;

        /// <summary>Same wording for every failed verify, so nothing distinguishes "wrong code" from "no such account".</summary>
        private const string PasswordResetInvalidMessage = "That code is invalid or has expired. Request a new one.";

        public UserService(
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            IConfiguration config,
            AppDbContext db,
            IEmailService emailService,
            ILogger<UserService> logger)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _config = config;
            _dbContext = db;
            _emailService = emailService;
            _logger = logger;
        }

        public async Task<UserLoginResponseDTO?> RegisterAsync(UserRegisterDTO input)
        {
            var user = await _userManager.FindByEmailAsync(input.Email);

            // Generic message — don't reveal whether an email is already registered (user enumeration).
            if (user is not null)
                throw new ValidationException("Unable to register with the provided details.");

            user = new ApplicationUser
            {
                UserName = input.Email,
                Email = input.Email
            };

            var result = await _userManager.CreateAsync(user, input.Password);

            if (!result.Succeeded)
                throw new ValidationException(result.Errors.Select(x => x.Description).FirstOrDefault() ?? "Could not create the account.");

            await _userManager.AddToRoleAsync(user, "User"); //default 
            await AssignPlanToUserAsync(user.Id, "Free");

            return await LoginAsync(new() { Email = input.Email, Password = input.Password });
        }

        public async Task<UserLoginResponseDTO?> LoginAsync(UserLoginRequestDTO input)
        {
            var user = await _userManager.FindByEmailAsync(input.Email) ?? throw new UnauthorizedAccessException("Invalid email or password.");

            var result = await _signInManager.CheckPasswordSignInAsync(user, input.Password, lockoutOnFailure: true);
            if (result.IsLockedOut)
                throw new UnauthorizedAccessException("Account temporarily locked due to too many failed attempts. Please try again later.");
            if (!result.Succeeded)
                throw new UnauthorizedAccessException("Invalid email or password.");

            var accessToken = await GenerateAccessTokenAsync(user);
            var refreshToken = await CreateAndStoreRefreshTokenAsync(user);

            return new() { AccessToken = accessToken, RefreshToken = refreshToken };
        }

        public async Task<RefreshResultDTO> RefreshAsync(HttpContext context)
        {
            if (!context.Request.Cookies.TryGetValue("refreshToken", out var token))
                return new RefreshResultDTO(null, null, IsUnauthorized: true, ErrorMessage: "No refresh token");

            var tokenHash = HashSecret(token);
            var refreshToken = await _dbContext.RefreshTokens
                .Include(rt => rt.User)
                .FirstOrDefaultAsync(rt => rt.Token == tokenHash);

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
                var tokenHash = HashSecret(token);
                var refreshToken = await _dbContext.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == tokenHash);
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

        // ── Forgot password ────────────────────────────────────────────────────────────────────
        // Three steps: request a code → verify it for a ticket → set the password with the ticket.
        // Splitting verify from reset means a wrong code is reported before the user types a new
        // password, and keeps the 2-minute window on the code alone.

        /// <summary>
        /// Emails a fresh 6-digit code. Returns silently for unknown addresses and for repeat
        /// requests inside the cooldown — the caller must answer identically either way, or the
        /// endpoint becomes a way to test which emails are registered.
        /// </summary>
        public async Task RequestPasswordResetAsync(string email)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user is null || string.IsNullOrEmpty(user.Email)) return;

            var now = DateTime.UtcNow;

            var lastIssued = await _dbContext.PasswordResetCodes
                .Where(c => c.UserId == user.Id)
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => (DateTime?)c.CreatedAt)
                .FirstOrDefaultAsync();

            if (lastIssued.HasValue && now - lastIssued.Value < PasswordResetResendCooldown)
                return;

            // Issuing a new code retires every earlier one, so only the latest email ever works.
            await _dbContext.PasswordResetCodes
                .Where(c => c.UserId == user.Id && c.ConsumedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.ConsumedAt, now));

            var code = GeneratePasswordResetCode();

            _dbContext.PasswordResetCodes.Add(new PasswordResetCode
            {
                UserId = user.Id,
                CodeHash = HashSecret(code),
                CreatedAt = now,
                ExpiresAt = now.Add(PasswordResetCodeLifetime)
            });
            await _dbContext.SaveChangesAsync();

            try
            {
                await _emailService.SendPasswordResetCodeAsync(
                    user.Email,
                    user.DisplayName ?? user.Handle ?? user.Email,
                    code,
                    (int)PasswordResetCodeLifetime.TotalMinutes);
            }
            catch (Exception ex)
            {
                // Swallowed on purpose: surfacing a send failure here would tell an attacker the
                // address exists. The user can retry once the cooldown lapses.
                _logger.LogError(ex, "Password reset code could not be delivered to {UserId}", user.Id);
            }
        }

        /// <summary>Checks the emailed code and, on success, swaps it for a single-use ticket.</summary>
        public async Task<VerifyResetCodeResultDTO> VerifyPasswordResetCodeAsync(string email, string code)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user is null)
                return new VerifyResetCodeResultDTO(false, ErrorMessage: PasswordResetInvalidMessage);

            var entry = await _dbContext.PasswordResetCodes
                .Where(c => c.UserId == user.Id && c.ConsumedAt == null)
                .OrderByDescending(c => c.CreatedAt)
                .FirstOrDefaultAsync();

            var now = DateTime.UtcNow;

            if (entry is null || entry.ExpiresAt <= now || entry.Attempts >= PasswordResetMaxAttempts)
                return new VerifyResetCodeResultDTO(false, ErrorMessage: PasswordResetInvalidMessage);

            if (!SecretMatches(entry.CodeHash, code))
            {
                entry.Attempts++;
                await _dbContext.SaveChangesAsync();
                return new VerifyResetCodeResultDTO(false, ErrorMessage: PasswordResetInvalidMessage);
            }

            // The code has done its job; from here the (much longer) ticket carries the authority,
            // which is why the ticket's clock is independent of the 2-minute code window.
            var ticket = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            entry.TicketHash = HashSecret(ticket);
            entry.TicketExpiresAt = now.Add(PasswordResetTicketLifetime);
            await _dbContext.SaveChangesAsync();

            return new VerifyResetCodeResultDTO(true, ticket, entry.TicketExpiresAt);
        }

        /// <summary>
        /// Sets the new password against a verified ticket and signs the user straight in.
        /// Works for Google-only accounts too — Identity happily sets a first password.
        /// </summary>
        public async Task<ResetPasswordResultDTO> ResetPasswordAsync(string email, string ticket, string newPassword)
        {
            const string expired = "This reset session has expired. Please start over.";

            var user = await _userManager.FindByEmailAsync(email);
            if (user is null)
                return new ResetPasswordResultDTO(false, ErrorMessage: expired);

            var ticketHash = HashSecret(ticket);
            var entry = await _dbContext.PasswordResetCodes
                .FirstOrDefaultAsync(c => c.UserId == user.Id && c.ConsumedAt == null && c.TicketHash == ticketHash);

            if (entry is null || entry.TicketExpiresAt is null || entry.TicketExpiresAt <= DateTime.UtcNow)
                return new ResetPasswordResultDTO(false, ErrorMessage: expired);

            // Our code+ticket proves mailbox control; Identity's own token is what authorises the
            // write, so the password policy and security stamp are enforced the usual way.
            var identityToken = await _userManager.GeneratePasswordResetTokenAsync(user);
            var result = await _userManager.ResetPasswordAsync(user, identityToken, newPassword);

            if (!result.Succeeded)
            {
                // A rejected password (too short, no digit…) must not burn the ticket — the user
                // should be able to correct it without going back to their inbox.
                var message = result.Errors.FirstOrDefault()?.Description ?? "Could not update the password.";
                return new ResetPasswordResultDTO(false, ErrorMessage: message);
            }

            entry.ConsumedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync();

            // Whoever knew the old password loses their sessions; a reset is often a compromise.
            var revokedAt = DateTime.UtcNow;
            await _dbContext.RefreshTokens
                .Where(t => t.UserId == user.Id && t.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, revokedAt));

            // A user locked out by the failed logins that sent them here must not stay locked out.
            await _userManager.ResetAccessFailedCountAsync(user);
            if (await _userManager.GetLockoutEnabledAsync(user))
                await _userManager.SetLockoutEndDateAsync(user, null);

            var accessToken = await GenerateAccessTokenAsync(user);
            var refreshToken = await CreateAndStoreRefreshTokenAsync(user);

            return new ResetPasswordResultDTO(true, accessToken, refreshToken);
        }

        private static string GeneratePasswordResetCode()
            => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

        private static string HashSecret(string value)
            => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

        private static bool SecretMatches(string storedHash, string candidate)
            => CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(storedHash),
                Encoding.UTF8.GetBytes(HashSecret(candidate)));

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
            // Base64url: the raw value travels in a cookie, and '+' / '/' are hostile there.
            var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(64));

            var refreshToken = new RefreshToken
            {
                UserId = user.Id,
                Token = HashSecret(token), // only the digest is persisted
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
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId)
                ?? throw new NotFoundException("User not found.");
            var plan = await _dbContext.Plans.FirstOrDefaultAsync(p => p.Name == planName)
                ?? throw new NotFoundException("Plan not found.");

            var now = DateTime.UtcNow;
            var isFree = planName == "Free";

            user.PlanId = plan.Id;
            user.BuyedMemory = plan.StorageLimitMB * BytesPerMb;
            user.BuyedBandwidth = plan.BandwidthMB * BytesPerMb;
            user.UsedBandwidth = 0;
            user.BandwidthCycleStart = now;
            user.BandwidthOverageNotifiedAt = null;

            // Extend from whatever time is still on the clock rather than from today. Renewing early
            // used to reset the expiry to now+1 month, silently destroying the days already paid for.
            var extendFrom = user.PlanExpiration is { } existing && existing > now && !isFree
                ? existing
                : now;

            user.PlanExpiration = isFree ? now.AddDays(7) : extendFrom.AddMonths(1);

            _dbContext.Users.Update(user);
            await _dbContext.SaveChangesAsync();
        }

        public async Task UnassingPlanFromUserAsync(string userId)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId) ?? throw new NotFoundException("User not found.");
            user.PlanId = null;
            user.BuyedMemory = null;
            user.PlanExpiration = null;
            user.BuyedBandwidth = null;
            user.UsedBandwidth = null;
            _dbContext.Users.Update(user);
            await _dbContext.SaveChangesAsync();
        }

        /// <summary>Sentinel returned by <see cref="CanUserUploadAsync"/> when the upload may proceed.</summary>
        public const string UploadAllowed = "Yes";

        public async Task<string> CanUserUploadAsync(string userId, long fileSize)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId)
                ?? throw new NotFoundException("User not found.");

            if (user.BuyedMemory is null || user.PlanId is null)
                return "You need an active plan to upload.";
            if (user.PlanExpiration < DateTime.UtcNow)
            {
                await UnassingPlanFromUserAsync(userId);
                return "Your plan has expired. Renew it to keep uploading.";
            }
            // UsedMemory, BuyedMemory and fileSize are all in bytes.
            if ((user.UsedMemory ?? 0) + fileSize > user.BuyedMemory)
                return "This file won't fit in your remaining storage.";

            return UploadAllowed;
        }
    }
}