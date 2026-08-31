using System.Text.Json;
using System.Text.RegularExpressions;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public partial class ProfileService : IProfileService
{
    private readonly AppDbContext _db;
    private readonly IAmazonS3 _s3;
    private readonly IUserService _userService;
    private readonly string? _bucket;

    /// <summary>
    /// Handles that collide with a literal segment under /api/profiles. A user holding one of these
    /// would have their public profile shadowed by the same-named route: GET /api/profiles/me wins
    /// over GET /api/profiles/{handle}, so /u/me would serve the *viewer's* own profile instead.
    /// </summary>
    private static readonly HashSet<string> ReservedHandles = new(StringComparer.OrdinalIgnoreCase)
    {
        "me", "search",
    };

    private static readonly string[] AllowedProfileImageTypes = ["image/jpeg", "image/png", "image/webp"];
    private const long MaxProfileImageBytes = 10 * 1024 * 1024;

    public ProfileService(AppDbContext db, IAmazonS3 s3, IUserService userService, IConfiguration config)
    {
        _db = db;
        _s3 = s3;
        _userService = userService;
        _bucket = config["AWS:BucketName"];
    }

    public async Task<PublicProfileDTO?> GetPublicProfileAsync(string handle, string? viewerUserId = null)
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
            BannerOffsetY = user.BannerOffsetY,
            IsOwner = viewerUserId != null && viewerUserId == user.Id,
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

        // Two queries for the whole page instead of two per row: this loop used to issue a count and
        // an avatar lookup for each of 24 users — 49 round trips for one search.
        var userIds = users.Select(u => u.Id).ToList();

        var workCounts = await _db.Media.AsNoTracking()
            .Where(m => userIds.Contains(m.UserId) && m.IsPublic && !m.IsProfileAsset)
            .GroupBy(m => m.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);

        var avatarIds = users.Where(u => u.AvatarMediaId.HasValue).Select(u => u.AvatarMediaId!.Value).ToList();
        var avatars = await _db.Media.AsNoTracking()
            .Where(m => avatarIds.Contains(m.Id))
            .Select(m => new { m.Id, m.UserId, m.ContentType })
            .ToListAsync();

        return users.Select(u =>
        {
            // Presign only an image the user actually owns — same rule as PresignOwnedMediaAsync.
            var avatar = u.AvatarMediaId.HasValue
                ? avatars.FirstOrDefault(a => a.Id == u.AvatarMediaId.Value && a.UserId == u.Id && IsImage(a.ContentType))
                : null;

            return new ProfileSearchResultDTO
            {
                Handle = u.Handle!,
                DisplayName = string.IsNullOrWhiteSpace(u.DisplayName) ? u.Handle! : u.DisplayName!,
                AvatarUrl = avatar == null ? null : PresignKey(avatar.Id.ToString()),
                WorkCount = workCounts.GetValueOrDefault(u.Id, 0),
            };
        }).ToList();
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
            AvatarMediaId = await ImageMediaIdOrNullAsync(user.Id, user.AvatarMediaId),
            BannerMediaId = await ImageMediaIdOrNullAsync(user.Id, user.BannerMediaId),
            AvatarUrl = await PresignOwnedMediaAsync(user.Id, user.AvatarMediaId),
            BannerUrl = await PresignOwnedMediaAsync(user.Id, user.BannerMediaId),
            BannerOffsetY = user.BannerOffsetY,
            ThemeJson = user.ThemeJson,
            IsProfilePublic = user.IsProfilePublic,
        };
    }

    public async Task UpdateProfileAsync(string userId, UpdateProfileDTO dto)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new NotFoundException("User not found.");

        // A handle is the user's public identity: every /u/<handle> link, and their place in search,
        // depends on it. Absence must therefore mean "unchanged", never "delete". Only an explicit
        // empty string clears it — an omitted field used to silently destroy the profile URL.
        if (dto.Handle is not null)
        {
            var handle = dto.Handle.Trim().ToLowerInvariant();

            if (handle.Length == 0)
            {
                user.Handle = null;
            }
            else
            {
                if (!HandleRegex().IsMatch(handle))
                    throw new ValidationException("Handle must be 3–30 characters using only lowercase letters, numbers, '-' or '_'.");

                if (ReservedHandles.Contains(handle))
                    throw new ValidationException("That handle is reserved. Please choose another.");

                var taken = await _db.Users.AnyAsync(u => u.Handle == handle && u.Id != userId);
                if (taken)
                    throw new ValidationException("That handle is already taken.");

                user.Handle = handle;
            }
        }

        user.DisplayName = Trim(dto.DisplayName, 60);
        user.Bio = Trim(dto.Bio, 1000);
        user.WebsiteUrl = Trim(dto.WebsiteUrl, 300);
        user.Location = Trim(dto.Location, 100);
        var previousAvatarId = user.AvatarMediaId;
        var previousBannerId = user.BannerMediaId;

        user.AvatarMediaId = await ValidateOwnedMediaAsync(userId, dto.AvatarMediaId);
        user.BannerMediaId = await ValidateOwnedMediaAsync(userId, dto.BannerMediaId);
        user.BannerOffsetY = Math.Clamp(dto.BannerOffsetY, 0, 100);
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

    public async Task UpdateBannerOffsetAsync(string userId, int bannerOffsetY)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new NotFoundException("User not found.");

        user.BannerOffsetY = Math.Clamp(bannerOffsetY, 0, 100);
        await _db.SaveChangesAsync();
    }

    public Task<ProfileImageUploadUrlDTO> CreateProfileImageUploadUrlAsync(string userId, string contentType)
    {
        var type = (contentType ?? string.Empty).Trim().ToLowerInvariant();
        if (!AllowedProfileImageTypes.Contains(type))
            throw new ValidationException("A profile image must be a JPEG, PNG or WebP.");

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
            throw new ValidationException("Profile image kind must be 'avatar' or 'banner'.");

        var contentType = (dto.ContentType ?? string.Empty).Trim().ToLowerInvariant();
        if (!AllowedProfileImageTypes.Contains(contentType))
            throw new ValidationException("A profile image must be a JPEG, PNG or WebP.");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new NotFoundException("User not found.");

        if (await _db.Media.AnyAsync(m => m.Id == dto.MediaId))
            throw new ValidationException("That upload has already been confirmed.");

        // Trust the bucket, not the client, for the size — the same rule the media upload path uses.
        long actualSize;
        try
        {
            var meta = await _s3.GetObjectMetadataAsync(_bucket, dto.MediaId.ToString());
            actualSize = meta.ContentLength;
        }
        catch
        {
            throw new NotFoundException("The uploaded image was not found in storage.");
        }

        if (actualSize <= 0 || actualSize > MaxProfileImageBytes)
            throw new ValidationException($"A profile image must be no larger than {MaxProfileImageBytes / (1024 * 1024)} MB.");

        var quota = await _userService.CanUserUploadAsync(userId, actualSize);
        if (quota != "Yes")
            throw new QuotaExceededException(quota);

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
        if (kind == "avatar")
        {
            user.AvatarMediaId = media.Id;
        }
        else
        {
            user.BannerMediaId = media.Id;
            // A different photo crops differently, so start the new banner centred rather than
            // inheriting a position that was tuned for the old one.
            user.BannerOffsetY = 50;
        }

        await _db.SaveChangesAsync();

        await DeleteProfileAssetIfOrphanedAsync(userId, replacedId);

        return new ProfileImageDTO
        {
            MediaId = media.Id,
            Url = PresignKey(media.Id.ToString()),
            BannerOffsetY = user.BannerOffsetY,
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

    private static bool IsImage(string? contentType)
        => contentType != null && contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Returns the media id only if it exists, belongs to the user, and is an image. A media id the
    /// user doesn't own is dropped silently rather than confirming it exists; a video or audio file
    /// they do own is rejected out loud, since that is a mistake worth explaining.
    /// </summary>
    private async Task<Guid?> ValidateOwnedMediaAsync(string userId, Guid? mediaId)
    {
        if (mediaId == null) return null;

        var contentType = await _db.Media.AsNoTracking()
            .Where(m => m.Id == mediaId && m.UserId == userId)
            .Select(m => m.ContentType)
            .FirstOrDefaultAsync();

        if (contentType == null) return null;

        if (!IsImage(contentType))
            throw new ValidationException("Your avatar and banner have to be images — videos and audio can't be used.");

        return mediaId;
    }

    /// <summary>
    /// Reports a non-image avatar/banner as unset. Profiles saved before images were enforced can
    /// still point at a video; surfacing that id would make the editor fail every save on data the
    /// owner never chose under the current rules.
    /// </summary>
    private async Task<Guid?> ImageMediaIdOrNullAsync(string userId, Guid? mediaId)
    {
        if (mediaId == null) return null;

        var contentType = await _db.Media.AsNoTracking()
            .Where(m => m.Id == mediaId && m.UserId == userId)
            .Select(m => m.ContentType)
            .FirstOrDefaultAsync();

        return IsImage(contentType) ? mediaId : null;
    }

    /// <summary>Presigns an image that belongs to the user. Non-images never render as profile art.</summary>
    private async Task<string?> PresignOwnedMediaAsync(string userId, Guid? mediaId)
    {
        if (mediaId == null) return null;

        var media = await _db.Media.AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == mediaId && m.UserId == userId);
        if (media == null || !IsImage(media.ContentType)) return null;

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
        catch { throw new ValidationException("Invalid theme."); }
        if (root.ValueKind != JsonValueKind.Object) throw new ValidationException("Invalid theme.");

        var clean = new Dictionary<string, string>();

        foreach (var key in new[] { "bg", "surface", "text", "textMuted", "accent", "border" })
        {
            if (root.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String &&
                HexColorRegex().IsMatch(v.GetString()!))
                clean[key] = v.GetString()!;
            else
                throw new ValidationException($"Theme color '{key}' must be a hex value.");
        }

        foreach (var key in new[] { "headingFont", "bodyFont" })
        {
            if (root.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String &&
                AllowedFonts.Contains(v.GetString()!))
                clean[key] = v.GetString()!;
            else
                throw new ValidationException($"Theme font '{key}' is not allowed.");
        }

        if (root.TryGetProperty("radius", out var r) && r.ValueKind == JsonValueKind.String &&
            r.GetString() is "sharp" or "soft" or "round")
            clean["radius"] = r.GetString()!;
        else
            throw new ValidationException("Invalid theme radius.");

        if (root.TryGetProperty("backgroundKind", out var b) && b.ValueKind == JsonValueKind.String &&
            b.GetString() is "solid" or "banner")
            clean["backgroundKind"] = b.GetString()!;
        else
            throw new ValidationException("Invalid theme background.");

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
