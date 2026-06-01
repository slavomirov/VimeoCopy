using System.Text.RegularExpressions;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public partial class ProfileService : IProfileService
{
    private readonly AppDbContext _db;
    private readonly IAmazonS3 _s3;
    private readonly string? _bucket;

    public ProfileService(AppDbContext db, IAmazonS3 s3, IConfiguration config)
    {
        _db = db;
        _s3 = s3;
        _bucket = config["AWS:BucketName"];
    }

    public async Task<PublicProfileDTO?> GetPublicProfileAsync(string handle)
    {
        var normalized = (handle ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0) return null;

        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Handle == normalized && u.IsProfilePublic);

        if (user == null) return null;

        // Only public works belong on the portfolio.
        var works = await _db.Media
            .AsNoTracking()
            .Where(m => m.UserId == user.Id && m.IsPublic)
            .OrderByDescending(m => m.UploadedAt)
            .ToListAsync();

        var workIds = works.Select(m => m.Id).ToList();
        var projectByMedia = await _db.ProjectMedias
            .AsNoTracking()
            .Include(pm => pm.Project)
            .Where(pm => workIds.Contains(pm.MediaId))
            .GroupBy(pm => pm.MediaId)
            .ToDictionaryAsync(g => g.Key, g => g.First().Project);

        var dto = new PublicProfileDTO
        {
            Handle = user.Handle!,
            DisplayName = string.IsNullOrWhiteSpace(user.DisplayName) ? user.Handle! : user.DisplayName!,
            Bio = user.Bio,
            WebsiteUrl = user.WebsiteUrl,
            Location = user.Location,
            CreatedAt = user.CreatedAt,
            ThemeJson = user.ThemeJson,
            AvatarUrl = await PresignOwnedMediaAsync(user.Id, user.AvatarMediaId),
            BannerUrl = await PresignOwnedMediaAsync(user.Id, user.BannerMediaId),
            Works = works.Select(m =>
            {
                projectByMedia.TryGetValue(m.Id, out var project);
                return new ProfileWorkDTO
                {
                    Id = m.Id,
                    FileName = m.FileName,
                    ContentType = m.ContentType,
                    Description = m.Description,
                    HasThumbnail = !string.IsNullOrEmpty(m.ThumbnailUrl),
                    UploadedAt = m.UploadedAt,
                    ProjectId = project?.Id,
                    ProjectTitle = project?.Title,
                };
            }).ToList(),
        };

        return dto;
    }

    public async Task<IEnumerable<ProfileSearchResultDTO>> SearchProfilesAsync(string query)
    {
        var q = (query ?? string.Empty).Trim().ToLowerInvariant();
        if (q.Length == 0) return [];

        var users = await _db.Users
            .AsNoTracking()
            .Where(u => u.IsProfilePublic && u.Handle != null &&
                        (u.Handle.Contains(q) ||
                         (u.DisplayName != null && u.DisplayName.ToLower().Contains(q))))
            .OrderBy(u => u.Handle)
            .Take(24)
            .Select(u => new { u.Id, u.Handle, u.DisplayName, u.AvatarMediaId })
            .ToListAsync();

        var results = new List<ProfileSearchResultDTO>();
        foreach (var u in users)
        {
            var workCount = await _db.Media.CountAsync(m => m.UserId == u.Id && m.IsPublic);
            results.Add(new ProfileSearchResultDTO
            {
                Handle = u.Handle!,
                DisplayName = string.IsNullOrWhiteSpace(u.DisplayName) ? u.Handle! : u.DisplayName!,
                AvatarUrl = await PresignOwnedMediaAsync(u.Id, u.AvatarMediaId),
                WorkCount = workCount,
            });
        }

        return results;
    }

    public async Task<MyProfileDTO?> GetMyProfileAsync(string userId)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return null;

        return new MyProfileDTO
        {
            Handle = user.Handle,
            DisplayName = user.DisplayName,
            Bio = user.Bio,
            WebsiteUrl = user.WebsiteUrl,
            Location = user.Location,
            AvatarMediaId = user.AvatarMediaId,
            BannerMediaId = user.BannerMediaId,
            ThemeJson = user.ThemeJson,
            IsProfilePublic = user.IsProfilePublic,
        };
    }

    public async Task UpdateProfileAsync(string userId, UpdateProfileDTO dto)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new Exception("User not found");

        if (!string.IsNullOrWhiteSpace(dto.Handle))
        {
            var handle = dto.Handle.Trim().ToLowerInvariant();
            if (!HandleRegex().IsMatch(handle))
                throw new Exception("Handle must be 3–30 characters using only lowercase letters, numbers, '-' or '_'.");

            var taken = await _db.Users.AnyAsync(u => u.Handle == handle && u.Id != userId);
            if (taken)
                throw new Exception("That handle is already taken.");

            user.Handle = handle;
        }
        else
        {
            // Empty handle clears the public profile.
            user.Handle = null;
        }

        user.DisplayName = Trim(dto.DisplayName, 60);
        user.Bio = Trim(dto.Bio, 1000);
        user.WebsiteUrl = Trim(dto.WebsiteUrl, 300);
        user.Location = Trim(dto.Location, 100);
        user.AvatarMediaId = await ValidateOwnedMediaAsync(userId, dto.AvatarMediaId);
        user.BannerMediaId = await ValidateOwnedMediaAsync(userId, dto.BannerMediaId);
        user.ThemeJson = string.IsNullOrWhiteSpace(dto.ThemeJson) ? null : dto.ThemeJson;
        user.IsProfilePublic = dto.IsProfilePublic;

        await _db.SaveChangesAsync();
    }

    /// <summary>Returns the media id only if it exists and belongs to the user, else null.</summary>
    private async Task<Guid?> ValidateOwnedMediaAsync(string userId, Guid? mediaId)
    {
        if (mediaId == null) return null;
        var owns = await _db.Media.AnyAsync(m => m.Id == mediaId && m.UserId == userId);
        return owns ? mediaId : null;
    }

    /// <summary>Presigns a media object that belongs to the user (prefers its thumbnail).</summary>
    private async Task<string?> PresignOwnedMediaAsync(string userId, Guid? mediaId)
    {
        if (mediaId == null) return null;

        var media = await _db.Media.AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == mediaId && m.UserId == userId);
        if (media == null) return null;

        var key = mediaId.Value.ToString();
        return _s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = _bucket,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(60),
        });
    }

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        return value.Length > max ? value[..max] : value;
    }

    [GeneratedRegex("^[a-z0-9_-]{3,30}$")]
    private static partial Regex HandleRegex();
}
