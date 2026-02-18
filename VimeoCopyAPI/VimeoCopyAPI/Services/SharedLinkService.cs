using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class SharedLinkService : ISharedLinkService
{
    private readonly AppDbContext _dbContext;

    public SharedLinkService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<SharedLink> CreateSharedLinkAsync(string mediaId, string userId, int expirationHours)
    {
        var media = await _dbContext.Media.FirstOrDefaultAsync(m => m.Id.ToString() == mediaId)
            ?? throw new Exception("Media not found!");

        if (media.UserId != userId)
            throw new UnauthorizedAccessException("You don't have permission to share this media.");

        var token = GenerateToken();

        var sharedLink = new SharedLink
        {
            Id = Guid.NewGuid(),
            Token = token,
            MediaId = media.Id,
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddHours(expirationHours)
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

        if (link == null || link.ExpiresAt < DateTime.UtcNow)
            return null;

        return link;
    }

    private static string GenerateToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .Replace("=", "");
    }
}
