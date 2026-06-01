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

    public BandwidthService(AppDbContext dbContext, IHttpContextAccessor httpContextAccessor, IUserService userService)
    {
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
        _userService = userService;
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

        // Out of bandwidth check (only enforce when both numbers are present).
        if (owner.BuyedBandwidth.HasValue && (owner.UsedBandwidth ?? 0) >= owner.BuyedBandwidth.Value)
            return false;

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
        var mb = bytes / 1_000_000;
        if (mb < 1) mb = 1; // tiny files still count as 1MB so the row contributes

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

        await _userService.IncreaseUsedBandwidthAsync(media.UserId, mb);

        return true;
    }

    private static string? HashIp(HttpContext? ctx)
    {
        var ip = ctx?.Connection?.RemoteIpAddress?.ToString();
        if (string.IsNullOrEmpty(ip)) return null;
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(ip));
        return Convert.ToHexString(bytes);
    }
}
