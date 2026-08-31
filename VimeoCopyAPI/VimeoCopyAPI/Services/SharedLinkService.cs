using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class SharedLinkService : ISharedLinkService
{
    private readonly AppDbContext _dbContext;

    /// <summary>A share link is meant to be temporary; a week is the longest that stays true.</summary>
    public const int MinExpirationHours = 1;
    public const int MaxExpirationHours = 168;

    public SharedLinkService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<SharedLink> CreateSharedLinkAsync(string mediaId, string userId, int expirationHours)
    {
        if (!Guid.TryParse(mediaId, out var id))
            throw new NotFoundException("Media not found.");

        var media = await _dbContext.Media.FirstOrDefaultAsync(m => m.Id == id)
            ?? throw new NotFoundException("Media not found.");

        if (media.UserId != userId)
            throw new ForbiddenException("You don't have permission to share this media.");

        // Clamped, not trusted. The documented 168-hour maximum was never enforced, so a caller
        // could ask for a link lasting a thousand years — or overflow DateTime and crash the API.
        var hours = Math.Clamp(expirationHours, MinExpirationHours, MaxExpirationHours);

        var sharedLink = new SharedLink
        {
            Id = Guid.NewGuid(),
            Token = GenerateToken(),
            MediaId = media.Id,
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddHours(hours)
        };

        await _dbContext.SharedLinks.AddAsync(sharedLink);
        await _dbContext.SaveChangesAsync();

        return sharedLink;
    }

    public async Task<SharedLink?> GetValidSharedLinkAsync(string token)
    {
        var link = await _dbContext.SharedLinks
            .Include(sl => sl.Media)
            .FirstOrDefaultAsync(sl => sl.Token == token);

        if (link == null || link.IsExpired || link.IsRevoked)
            return null;

        return link;
    }

    public async Task<List<SharedLinkDTO>> GetLinksForMediaAsync(string mediaId, string userId)
    {
        if (!Guid.TryParse(mediaId, out var id))
            throw new NotFoundException("Media not found.");

        var owns = await _dbContext.Media.AnyAsync(m => m.Id == id && m.UserId == userId);
        if (!owns)
            throw new ForbiddenException("You don't have permission to view this media's links.");

        var now = DateTime.UtcNow;

        return await _dbContext.SharedLinks
            .Where(sl => sl.MediaId == id && sl.RevokedAt == null && sl.ExpiresAt > now)
            .OrderByDescending(sl => sl.CreatedAt)
            .Select(sl => new SharedLinkDTO
            {
                Token = sl.Token,
                CreatedAt = sl.CreatedAt,
                ExpiresAt = sl.ExpiresAt,
            })
            .ToListAsync();
    }

    public async Task RevokeSharedLinkAsync(string token, string userId)
    {
        var link = await _dbContext.SharedLinks
            .FirstOrDefaultAsync(sl => sl.Token == token)
            ?? throw new NotFoundException("That share link doesn't exist.");

        if (link.CreatedByUserId != userId)
            throw new ForbiddenException("You don't have permission to revoke this link.");

        if (link.IsRevoked) return; // already withdrawn; nothing to do

        link.RevokedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
    }

    private static string GenerateToken()
        => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
}
