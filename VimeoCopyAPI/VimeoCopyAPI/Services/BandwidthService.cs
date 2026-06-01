using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class BandwidthService : IBandwidthService
{
    private readonly AppDbContext _dbContext;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IUserService _userService;
    private readonly IEmailService _emailService;
    private readonly bool _hardCap;
    private readonly string _ipHashSalt;

    public BandwidthService(
        AppDbContext dbContext,
        IHttpContextAccessor httpContextAccessor,
        IUserService userService,
        IEmailService emailService,
        IConfiguration config)
    {
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
        _userService = userService;
        _emailService = emailService;
        // Soft cap by default: never cut off a creator's audience. Flip Bandwidth:HardCap=true to enforce hard.
        _hardCap = config.GetValue("Bandwidth:HardCap", false);
        // Salt the viewer-IP hash so the stored value isn't a plain reversible digest (GDPR).
        _ipHashSalt = config["Bandwidth:IpHashSalt"] ?? config["Jwt:Key"] ?? "vimeocopy-bandwidth-salt";
    }

    public async Task<bool> TrackPresignAsync(Media media, BandwidthSource source)
    {
        var ctx = _httpContextAccessor.HttpContext;
        var viewerUserId = ctx?.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        // Owner viewing own media doesn't count.
        if (!string.IsNullOrEmpty(viewerUserId) && viewerUserId == media.UserId)
            return true;

        var owner = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == media.UserId);
        if (owner == null) return true; // can't enforce against missing owner

        // Lazy monthly reset: if the cycle has rolled over, zero usage before checking the quota.
        if (UserService.RollBandwidthCycleIfDue(owner))
            await _dbContext.SaveChangesAsync();

        // Over quota?
        if (owner.BuyedBandwidth.HasValue && (owner.UsedBandwidth ?? 0) >= owner.BuyedBandwidth.Value)
        {
            await NotifyOwnerOverageAsync(owner);
            // Soft cap (default): keep serving so the audience isn't cut off. Hard cap: refuse.
            if (_hardCap) return false;
        }

        var ipHash = viewerUserId == null ? HashIp(ctx) : null;
        var hourBucket = DateTime.UtcNow.ToString("yyyyMMddHH");

        var alreadyCounted = await _dbContext.BandwidthLogs.AnyAsync(b =>
            b.MediaId == media.Id &&
            b.HourBucket == hourBucket &&
            (viewerUserId != null
                ? b.ViewerUserId == viewerUserId
                : b.ViewerIpHash == ipHash));

        if (alreadyCounted) return true;

        var bytes = media.FileSize;

        _dbContext.BandwidthLogs.Add(new BandwidthLog
        {
            OwnerUserId = media.UserId,
            MediaId = media.Id,
            Bytes = bytes,
            ViewerUserId = viewerUserId,
            ViewerIpHash = ipHash,
            HourBucket = hourBucket,
            Source = source,
            CreatedAt = DateTime.UtcNow,
        });
        await _dbContext.SaveChangesAsync();

        await _userService.IncreaseUsedBandwidthAsync(media.UserId, bytes);

        return true;
    }

    /// <summary>Emails the owner at most once per bandwidth cycle when they cross their limit.</summary>
    private async Task NotifyOwnerOverageAsync(ApplicationUser owner)
    {
        var cycleStart = owner.BandwidthCycleStart ?? owner.CreatedAt;
        if (owner.BandwidthOverageNotifiedAt.HasValue && owner.BandwidthOverageNotifiedAt.Value >= cycleStart)
            return; // already notified this cycle

        owner.BandwidthOverageNotifiedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        if (!string.IsNullOrEmpty(owner.Email))
            await _emailService.SendBandwidthExceededAsync(owner.Email, owner.UserName ?? owner.Email);
    }

    private string? HashIp(HttpContext? ctx)
    {
        var ip = ctx?.Connection?.RemoteIpAddress?.ToString();
        if (string.IsNullOrEmpty(ip)) return null;
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(_ipHashSalt + ip));
        return Convert.ToHexString(bytes);
    }
}
