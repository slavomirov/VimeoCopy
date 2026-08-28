using System.Text.Json;
using System.Text.RegularExpressions;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public partial class ProfileService : IProfileService
{
    private readonly AppDbContext _db;
    private readonly IAmazonS3 _s3;
    private readonly IUserService _userService;
    private readonly string? _bucket;

    private static readonly string[] AllowedProfileImageTypes = ["image/jpeg", "image/png", "image/webp"];
    private const long MaxProfileImageBytes = 10 * 1024 * 1024;

    public ProfileService(AppDbContext db, IAmazonS3 s3, IUserService userService, IConfiguration config)
    {
        _db = db;
        _s3 = s3;
        _userService = userService;
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
            .Where(m => m.UserId == user.Id && m.IsPublic && !m.IsProfileAsset)
            .OrderByDescending(m => m.UploadedAt)
            .ToListAsync();

        var workIds = works.Select(m => m.Id).ToList();
        var projectByMedia = await _db.ProjectMedias
            .AsNoTracking()
            .Include(pm => pm.Project)
            .Where(pm => workIds.Contains(pm.MediaId))
            .GroupBy(pm => pm.MediaId)
            .ToDictionaryAsync(g => g.Key, g => g.First().Project);

        // Group the public works into albums (projects). Cover = project thumbnail when it's a public
        // work, otherwise the album's most recent work; prefer the cheap thumbnail object.
        var albums = new List<ProfileAlbumDTO>();
        foreach (var grp in works
            .Where(w => projectByMedia.ContainsKey(w.Id))
            .GroupBy(w => projectByMedia[w.Id].Id))
        {
            var project = projectByMedia[grp.First().Id];
            var cover = (project.ThumbnailMediaId.HasValue
                            ? works.FirstOrDefault(w => w.Id == project.ThumbnailMediaId.Value)
                            : null)
                        ?? grp.First();
            albums.Add(new ProfileAlbumDTO
            {
                Id = project.Id,
                Title = project.Title,
                Description = project.Description,
                WorkCount = grp.Count(),
                CoverUrl = !string.IsNullOrEmpty(cover.ThumbnailUrl)
                    ? PresignKey(cover.ThumbnailUrl)
                    : PresignKey(cover.Id.ToString()),
            });
        }

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
            Albums = albums,
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
            var workCount = await _db.Media.CountAsync(m => m.UserId == u.Id && m.IsPublic && !m.IsProfileAsset);
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
            AvatarUrl = await PresignOwnedMediaAsync(user.Id, user.AvatarMediaId),
            BannerUrl = await PresignOwnedMediaAsync(user.Id, user.BannerMediaId),
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
        var previousAvatarId = user.AvatarMediaId;
        var previousBannerId = user.BannerMediaId;

        user.AvatarMediaId = await ValidateOwnedMediaAsync(userId, dto.AvatarMediaId);
        user.BannerMediaId = await ValidateOwnedMediaAsync(userId, dto.BannerMediaId);
        user.ThemeJson = SanitizeThemeJson(dto.ThemeJson);
        user.IsProfilePublic = dto.IsProfilePublic;

        await _db.SaveChangesAsync();

        // Switching away from a profile-only upload strands it: nothing in the UI lists it, so the
        // owner could never delete it themselves. Reclaim it (and their storage quota) here.
        if (previousAvatarId != user.AvatarMediaId)
            await DeleteProfileAssetIfOrphanedAsync(userId, previousAvatarId);
        if (previousBannerId != user.BannerMediaId)
            await DeleteProfileAssetIfOrphanedAsync(userId, previousBannerId);
    }

    public Task<ProfileImageUploadUrlDTO> CreateProfileImageUploadUrlAsync(string userId, string contentType)
    {
        var type = (contentType ?? string.Empty).Trim().ToLowerInvariant();
        if (!AllowedProfileImageTypes.Contains(type))
            throw new Exception("A profile image must be a JPEG, PNG or WebP.");

        var mediaId = Guid.NewGuid();

        var url = _s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = _bucket,
            Key = mediaId.ToString(),
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddMinutes(15),
            ContentType = type,
        });

        return Task.FromResult(new ProfileImageUploadUrlDTO { UploadUrl = url, MediaId = mediaId });
    }

    public async Task<ProfileImageDTO> ConfirmProfileImageAsync(string userId, ConfirmProfileImageDTO dto)
    {
        var kind = (dto.Kind ?? string.Empty).Trim().ToLowerInvariant();
        if (kind is not ("avatar" or "banner"))
            throw new Exception("Profile image kind must be 'avatar' or 'banner'.");

        var contentType = (dto.ContentType ?? string.Empty).Trim().ToLowerInvariant();
        if (!AllowedProfileImageTypes.Contains(contentType))
            throw new Exception("A profile image must be a JPEG, PNG or WebP.");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new Exception("User not found");

        if (await _db.Media.AnyAsync(m => m.Id == dto.MediaId))
            throw new Exception("That upload has already been confirmed.");

        // Trust the bucket, not the client, for the size — the same rule the media upload path uses.
        long actualSize;
        try
        {
            var meta = await _s3.GetObjectMetadataAsync(_bucket, dto.MediaId.ToString());
            actualSize = meta.ContentLength;
        }
        catch
        {
            throw new Exception("The uploaded image was not found in storage.");
        }

        if (actualSize <= 0 || actualSize > MaxProfileImageBytes)
            throw new Exception($"A profile image must be no larger than {MaxProfileImageBytes / (1024 * 1024)} MB.");

        var quota = await _userService.CanUserUploadAsync(userId, actualSize);
        if (quota != "Yes")
            throw new Exception(quota);

        var media = new Media
        {
            Id = dto.MediaId,
            FileSize = actualSize,
            ContentType = contentType,
            UploadedAt = DateTime.UtcNow,
            UserId = userId,
            IsPublic = false,
            ShowOnMediaPage = false,
            IsProfileAsset = true,
            FileName = Trim(dto.FileName, 500),
        };

        await _db.Media.AddAsync(media);
        await _userService.IncreaseUsedMemoryAsync(userId, actualSize);

        var replacedId = kind == "avatar" ? user.AvatarMediaId : user.BannerMediaId;
        if (kind == "avatar") user.AvatarMediaId = media.Id;
        else user.BannerMediaId = media.Id;

        await _db.SaveChangesAsync();

        await DeleteProfileAssetIfOrphanedAsync(userId, replacedId);

        return new ProfileImageDTO
        {
            MediaId = media.Id,
            Url = PresignKey(media.Id.ToString()),
        };
    }

    /// <summary>
    /// Deletes a profile-only image once nothing points at it any more. Ordinary library uploads are
    /// left alone — the owner picked those from their own media and still owns them there.
    /// </summary>
    private async Task DeleteProfileAssetIfOrphanedAsync(string userId, Guid? mediaId)
    {
        if (mediaId == null) return;

        var media = await _db.Media.FirstOrDefaultAsync(m => m.Id == mediaId && m.UserId == userId);
        if (media == null || !media.IsProfileAsset) return;

        // The same upload can be set as both avatar and banner.
        var stillInUse = await _db.Users.AnyAsync(u => u.AvatarMediaId == mediaId || u.BannerMediaId == mediaId);
        if (stillInUse) return;

        await _userService.DecreaseUsedMemoryAsync(userId, media.FileSize);
        _db.Media.Remove(media);
        await _db.SaveChangesAsync();

        try
        {
            await _s3.DeleteObjectAsync(new DeleteObjectRequest
            {
                BucketName = _bucket,
                Key = mediaId.Value.ToString(),
            });
        }
        catch { /* the row is gone; orphaned object cleanup is best-effort */ }
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

        return PresignKey(mediaId.Value.ToString());
    }

    /// <summary>Presigns an arbitrary storage key (60-min GET) for read-only profile imagery.</summary>
    private string PresignKey(string key)
        => _s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = _bucket,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(60),
        });

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        return value.Length > max ? value[..max] : value;
    }

    private static readonly HashSet<string> AllowedFonts = new(StringComparer.Ordinal)
    {
        "Inter", "Fraunces", "Playfair Display", "Space Grotesk",
        "DM Sans", "DM Mono", "Cormorant Garamond", "Archivo Black",
    };

    /// <summary>
    /// Re-builds the theme from only known, type-checked tokens (hex colors, allow-listed fonts, enum
    /// radius/background). This blocks CSS-value injection — e.g. an "accent" of "url(http://x)" that
    /// would otherwise beacon every profile visitor's IP — since values are applied as CSS variables.
    /// </summary>
    private static string? SanitizeThemeJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;

        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch { throw new Exception("Invalid theme."); }
        if (root.ValueKind != JsonValueKind.Object) throw new Exception("Invalid theme.");

        var clean = new Dictionary<string, string>();

        foreach (var key in new[] { "bg", "surface", "text", "textMuted", "accent", "border" })
        {
            if (root.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String &&
                HexColorRegex().IsMatch(v.GetString()!))
                clean[key] = v.GetString()!;
            else
                throw new Exception($"Theme color '{key}' must be a hex value.");
        }

        foreach (var key in new[] { "headingFont", "bodyFont" })
        {
            if (root.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String &&
                AllowedFonts.Contains(v.GetString()!))
                clean[key] = v.GetString()!;
            else
                throw new Exception($"Theme font '{key}' is not allowed.");
        }

        if (root.TryGetProperty("radius", out var r) && r.ValueKind == JsonValueKind.String &&
            r.GetString() is "sharp" or "soft" or "round")
            clean["radius"] = r.GetString()!;
        else
            throw new Exception("Invalid theme radius.");

        if (root.TryGetProperty("backgroundKind", out var b) && b.ValueKind == JsonValueKind.String &&
            b.GetString() is "solid" or "banner")
            clean["backgroundKind"] = b.GetString()!;
        else
            throw new Exception("Invalid theme background.");

        if (root.TryGetProperty("preset", out var p) && p.ValueKind == JsonValueKind.String &&
            p.GetString()!.Length <= 40)
            clean["preset"] = p.GetString()!;

        return JsonSerializer.Serialize(clean);
    }

    [GeneratedRegex("^[a-z0-9_-]{3,30}$")]
    private static partial Regex HandleRegex();

    [GeneratedRegex("^#[0-9a-fA-F]{3,8}$")]
    private static partial Regex HexColorRegex();
}
