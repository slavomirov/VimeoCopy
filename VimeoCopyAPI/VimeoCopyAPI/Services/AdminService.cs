using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

/// <summary>
/// The administrative surface. See <see cref="IAdminService"/> for the two rules every method
/// here keeps; the interesting part of the implementation is what it refuses to do.
///
/// An admin account is the one account that can lock everybody out of the platform, so the guards
/// against that are not defensive padding — they are the feature. Nothing here lets the last
/// administrator be demoted, suspended or deleted, and nothing lets an admin do any of those to
/// themselves, because a mis-click on your own row is the realistic way it happens.
/// </summary>
public class AdminService : IAdminService
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IUserService _userService;
    private readonly IMediaService _mediaService;
    private readonly IAmazonS3 _s3;
    private readonly string? _bucket;
    private readonly IEmailService _email;
    private readonly ILogger<AdminService> _logger;

    private const int MaxPageSize = 100;

    /// <summary>Roles an administrator is allowed to hand out. Anything else is rejected rather
    /// than silently dropped, so a typo in the client can't quietly grant nothing.</summary>
    private static readonly HashSet<string> AssignableRoles =
        new(StringComparer.OrdinalIgnoreCase) { "Admin", "Moderator", "User" };

    public AdminService(
        AppDbContext db,
        UserManager<ApplicationUser> users,
        IUserService userService,
        IMediaService mediaService,
        IAmazonS3 s3,
        IConfiguration config,
        IEmailService email,
        ILogger<AdminService> logger)
    {
        _db = db;
        _users = users;
        _userService = userService;
        _mediaService = mediaService;
        _s3 = s3;
        _bucket = config["AWS:BucketName"];
        _email = email;
        _logger = logger;
    }

    // ── Overview ───────────────────────────────────────────

    public async Task<AdminOverviewDTO> GetOverviewAsync()
    {
        var now = DateTime.UtcNow;
        var since7 = now.AddDays(-7);
        var since30 = now.AddDays(-30);

        return new AdminOverviewDTO
        {
            TotalUsers = await _db.Users.CountAsync(),
            SuspendedUsers = await _db.Users.CountAsync(u => u.SuspendedAt != null),
            NewUsers7d = await _db.Users.CountAsync(u => u.CreatedAt >= since7),
            NewUsers30d = await _db.Users.CountAsync(u => u.CreatedAt >= since30),

            TotalMedia = await _db.Media.CountAsync(m => !m.IsProfileAsset),
            PrivateMedia = await _db.Media.CountAsync(m => !m.IsProfileAsset && !m.IsPublic),

            // Summed from the files, not from UsedMemory. The per-user counter is an accumulator
            // that drifts when a delete fails halfway; the files are the ground truth, and this is
            // the number to compare the counters against when one of them looks wrong.
            StoredBytes = await _db.Media.SumAsync(m => (long?)m.FileSize) ?? 0,
            BandwidthUsedBytes = await _db.Users.SumAsync(u => u.UsedBandwidth) ?? 0,

            PendingReports = await _db.MediaReports.CountAsync(r => r.Status == "Pending"),
            PendingDownloadRequests =
                await _db.DownloadRequests.CountAsync(r => r.Status == DownloadRequestStatus.Pending),

            PlanUsage = await _db.Plans
                .OrderBy(p => p.Price)
                .Select(p => new AdminPlanUsageDTO
                {
                    PlanName = p.Name,
                    UserCount = _db.Users.Count(u => u.PlanId == p.Id),
                })
                .ToListAsync(),
        };
    }

    // ── Users ──────────────────────────────────────────────

    public async Task<PagedResultDTO<AdminUserDTO>> SearchUsersAsync(string? query, int skip, int take)
    {
        skip = Math.Max(0, skip);
        take = Math.Clamp(take, 1, MaxPageSize);

        var users = _db.Users.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query))
        {
            var q = query.Trim();
            users = users.Where(u =>
                (u.Email != null && u.Email.Contains(q)) ||
                (u.Handle != null && u.Handle.Contains(q)) ||
                (u.DisplayName != null && u.DisplayName.Contains(q)) ||
                (u.UserName != null && u.UserName.Contains(q)));
        }

        var total = await users.CountAsync();

        var page = await users
            .Include(u => u.Plan)
            .OrderByDescending(u => u.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync();

        // Roles come from Identity's join table in one query for the whole page. Asking
        // UserManager per row is the version of this that issues 25 round trips to render a list.
        var ids = page.Select(u => u.Id).ToList();
        var roles = await (from ur in _db.UserRoles
                           join r in _db.Roles on ur.RoleId equals r.Id
                           where ids.Contains(ur.UserId)
                           select new { ur.UserId, r.Name })
            .ToListAsync();

        var mediaCounts = await _db.Media
            .Where(m => ids.Contains(m.UserId) && !m.IsProfileAsset)
            .GroupBy(m => m.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);

        return new PagedResultDTO<AdminUserDTO>
        {
            Items = [.. page.Select(u => ToDto(
                u,
                roles.Where(r => r.UserId == u.Id).Select(r => r.Name!).ToList(),
                mediaCounts.GetValueOrDefault(u.Id, 0)))],
            Total = total,
            Skip = skip,
            Take = take,
        };
    }

    public async Task<AdminUserDTO> GetUserAsync(string userId)
    {
        var user = await _db.Users.AsNoTracking().Include(u => u.Plan)
            .FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new NotFoundException("User not found.");

        return ToDto(user, await RolesOfAsync(userId),
            await _db.Media.CountAsync(m => m.UserId == userId && !m.IsProfileAsset));
    }

    public async Task<AdminUserDTO> GrantPlanAsync(string actorId, string userId, AdminGrantPlanDTO dto)
    {
        var user = await FindUserAsync(userId);
        var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Name == dto.PlanName)
            ?? throw new NotFoundException("No plan by that name.");

        var previous = user.PlanId is null
            ? "none"
            : await _db.Plans.Where(p => p.Id == user.PlanId).Select(p => p.Name).FirstOrDefaultAsync() ?? "none";

        // Deliberately the ordinary assignment: a granted plan has to be indistinguishable from a
        // bought one, quotas and expiry arithmetic included. A second implementation here would be
        // a second set of rules to keep in step, and it would drift the first time either changed.
        await _userService.AssignPlanToUserAsync(userId, plan.Name);

        // Extra months, if asked for, go on top — AssignPlanToUserAsync only ever grants one.
        if (dto.Months is > 1)
        {
            var fresh = await FindUserAsync(userId);
            fresh.PlanExpiration = (fresh.PlanExpiration ?? DateTime.UtcNow).AddMonths(dto.Months.Value - 1);
            await _db.SaveChangesAsync();
        }

        var months = dto.Months is > 1 ? " for " + dto.Months + " months" : "";
        await LogAsync(actorId, AdminAction.GrantPlan, "User", userId, user.Email,
            previous + " → " + plan.Name + months + " (no payment)" + ReasonSuffix(dto.Reason));

        return await GetUserAsync(userId);
    }

    public async Task<AdminUserDTO> GrantStorageAsync(string actorId, string userId, AdminGrantQuotaDTO dto)
    {
        var user = await FindUserAsync(userId);

        var before = user.BuyedMemory ?? 0;
        // Clamped at zero, and the bonus moves by however much the allowance actually moved. Taking
        // back more than was ever given must not leave a negative bonus behind, which the next plan
        // assignment would then subtract all over again.
        var after = Math.Max(0, before + dto.DeltaBytes);
        var applied = after - before;

        user.BuyedMemory = after;
        user.BonusMemory = (user.BonusMemory ?? 0) + applied;
        await _db.SaveChangesAsync();

        await LogAsync(actorId, AdminAction.GrantStorage, "User", userId, user.Email,
            Signed(applied) + " storage · " + Bytes(before) + " → " + Bytes(after) + ReasonSuffix(dto.Reason));

        return await GetUserAsync(userId);
    }

    public async Task<AdminUserDTO> GrantBandwidthAsync(string actorId, string userId, AdminGrantQuotaDTO dto)
    {
        var user = await FindUserAsync(userId);

        var before = user.BuyedBandwidth ?? 0;
        var after = Math.Max(0, before + dto.DeltaBytes);
        var applied = after - before;

        user.BuyedBandwidth = after;
        user.BonusBandwidth = (user.BonusBandwidth ?? 0) + applied;

        // Giving bandwidth to somebody who has run out is the whole point of the button, so clear
        // the overage notice with it — otherwise they stay flagged until the cycle rolls.
        if (applied > 0) user.BandwidthOverageNotifiedAt = null;

        await _db.SaveChangesAsync();

        await LogAsync(actorId, AdminAction.GrantBandwidth, "User", userId, user.Email,
            Signed(applied) + " bandwidth · " + Bytes(before) + " → " + Bytes(after) + ReasonSuffix(dto.Reason));

        return await GetUserAsync(userId);
    }

    public async Task<AdminUserDTO> ResetBandwidthAsync(string actorId, string userId)
    {
        var user = await FindUserAsync(userId);

        var used = user.UsedBandwidth ?? 0;
        user.UsedBandwidth = 0;
        user.BandwidthCycleStart = DateTime.UtcNow;
        user.BandwidthOverageNotifiedAt = null;
        await _db.SaveChangesAsync();

        await LogAsync(actorId, AdminAction.ResetBandwidth, "User", userId, user.Email,
            "cycle restarted, " + Bytes(used) + " of usage cleared");

        return await GetUserAsync(userId);
    }

    public async Task<AdminUserDTO> SetRolesAsync(string actorId, string userId, AdminSetRolesDTO dto)
    {
        var user = await FindUserAsync(userId);

        var requested = dto.Roles
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Select(r => r.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var unknown = requested.FirstOrDefault(r => !AssignableRoles.Contains(r));
        if (unknown is not null) throw new ValidationException(unknown + " is not a role.");

        var current = await RolesOfAsync(userId);
        var losingAdmin = current.Contains("Admin", StringComparer.OrdinalIgnoreCase)
                       && !requested.Contains("Admin", StringComparer.OrdinalIgnoreCase);

        if (losingAdmin)
        {
            if (userId == actorId)
                throw new ValidationException("You can't remove your own administrator role.");
            await EnsureNotLastAdminAsync(userId, "remove the administrator role from");
        }

        var toAdd = requested.Except(current, StringComparer.OrdinalIgnoreCase).ToList();
        var toRemove = current.Except(requested, StringComparer.OrdinalIgnoreCase).ToList();

        if (toRemove.Count > 0) Check(await _users.RemoveFromRolesAsync(user, toRemove));
        if (toAdd.Count > 0) Check(await _users.AddToRolesAsync(user, toAdd));

        if (toAdd.Count > 0 || toRemove.Count > 0)
        {
            await LogAsync(actorId, AdminAction.SetRoles, "User", userId, user.Email,
                (current.Count == 0 ? "none" : string.Join(", ", current)) + " → " +
                (requested.Count == 0 ? "none" : string.Join(", ", requested)));
        }

        return await GetUserAsync(userId);
    }

    public async Task<AdminUserDTO> SetSuspendedAsync(string actorId, string userId, AdminSuspendDTO dto)
    {
        var user = await FindUserAsync(userId);

        if (dto.Suspended)
        {
            if (userId == actorId) throw new ValidationException("You can't suspend your own account.");
            await EnsureNotLastAdminAsync(userId, "suspend");

            user.SuspendedAt = DateTime.UtcNow;
            user.SuspensionReason = Trim(dto.Reason, 300);
            // Identity's own gate, set alongside ours. Sign-in reads SuspendedAt for the message,
            // but anything that reaches SignInManager without passing through there is still stopped.
            user.LockoutEnabled = true;
            user.LockoutEnd = DateTimeOffset.MaxValue;

            // A suspension that leaves live sessions running is not a suspension. Access tokens are
            // short-lived; revoking the refresh tokens is what actually ends them.
            await _db.RefreshTokens
                .Where(t => t.UserId == userId && t.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, (DateTime?)DateTime.UtcNow));
        }
        else
        {
            user.SuspendedAt = null;
            user.SuspensionReason = null;
            user.LockoutEnd = null;
            user.AccessFailedCount = 0;
        }

        await _db.SaveChangesAsync();

        await LogAsync(actorId, dto.Suspended ? AdminAction.Suspend : AdminAction.Unsuspend,
            "User", userId, user.Email,
            dto.Suspended ? "sign-in blocked" + ReasonSuffix(dto.Reason) : "sign-in restored");

        return await GetUserAsync(userId);
    }

    public async Task<AdminUserDTO> SetProfileVisibilityAsync(string actorId, string userId, AdminSetFlagDTO dto)
    {
        var user = await FindUserAsync(userId);

        user.IsProfilePublic = dto.Value;
        await _db.SaveChangesAsync();

        await LogAsync(actorId, AdminAction.SetProfileVisibility, "User", userId, user.Email,
            dto.Value ? "public profile restored" : "public profile hidden");

        return await GetUserAsync(userId);
    }

    public async Task DeleteUserAsync(string actorId, string userId)
    {
        if (userId == actorId) throw new ValidationException("You can't delete your own account here.");

        var user = await FindUserAsync(userId);
        await EnsureNotLastAdminAsync(userId, "delete");

        var email = user.Email;

        // Objects first, rows second — same ordering, and the same reason, as deleting one file:
        // the row is the only record of the key, so dropping it first strands the object with
        // nothing left pointing at it. Best-effort per object; one unreachable key must not leave
        // the account half-deleted.
        var media = await _db.Media
            .Where(m => m.UserId == userId)
            .Select(m => new { m.Id, m.ThumbnailUrl, m.GifUrl })
            .ToListAsync();

        foreach (var m in media)
        {
            await TryDeleteObjectAsync(m.Id.ToString());
            if (!string.IsNullOrEmpty(m.ThumbnailUrl)) await TryDeleteObjectAsync(m.ThumbnailUrl);
            if (!string.IsNullOrEmpty(m.GifUrl)) await TryDeleteObjectAsync(m.GifUrl);
        }

        var mediaIds = media.Select(m => m.Id).ToList();

        // Everything pointing at this user's media without a cascading foreign key. ProjectMedias is
        // NoAction on purpose (cascade cycle), and the request tables carry no key at all, so each
        // one either blocks the delete or outlives it unless it goes first.
        await _db.ProjectMedias.Where(pm => mediaIds.Contains(pm.MediaId)).ExecuteDeleteAsync();
        await _db.DownloadRequests
            .Where(r => r.OwnerUserId == userId || r.RequesterUserId == userId || mediaIds.Contains(r.MediaId))
            .ExecuteDeleteAsync();
        await _db.MediaReports
            .Where(r => mediaIds.Contains(r.MediaId) || r.ReporterUserId == userId)
            .ExecuteDeleteAsync();
        await _db.BandwidthLogs.Where(b => b.OwnerUserId == userId).ExecuteDeleteAsync();
        await _db.Media.Where(m => m.UserId == userId).ExecuteDeleteAsync();

        // Written before the account disappears: ActorEmail and TargetLabel are resolved from rows
        // that are about to stop existing, and a log line reading "deleted (null)" answers nothing.
        await LogAsync(actorId, AdminAction.DeleteUser, "User", userId, email,
            "account and " + media.Count + " file(s) deleted permanently");

        Check(await _users.DeleteAsync(user));

        _logger.LogWarning("Admin {ActorId} deleted account {UserId} ({Email}).", actorId, userId, email);
    }

    // ── Media ──────────────────────────────────────────────

    public async Task<PagedResultDTO<AdminMediaDTO>> SearchMediaAsync(
        string? query, string? ownerId, string? visibility, int skip, int take)
    {
        skip = Math.Max(0, skip);
        take = Math.Clamp(take, 1, MaxPageSize);

        // Profile assets are included here, unlike everywhere else in the app: an avatar is still a
        // file somebody uploaded, and "take this image down" has to be able to reach it.
        var media = _db.Media.AsNoTracking().Include(m => m.User).AsQueryable();

        if (!string.IsNullOrWhiteSpace(ownerId))
            media = media.Where(m => m.UserId == ownerId);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var q = query.Trim();
            media = media.Where(m =>
                (m.FileName != null && m.FileName.Contains(q)) ||
                (m.Description != null && m.Description.Contains(q)) ||
                (m.User.Email != null && m.User.Email.Contains(q)) ||
                (m.User.Handle != null && m.User.Handle.Contains(q)));
        }

        media = visibility?.ToLowerInvariant() switch
        {
            "public" => media.Where(m => m.IsPublic),
            "private" => media.Where(m => !m.IsPublic),
            _ => media,
        };

        var total = await media.CountAsync();

        var page = await media
            .OrderByDescending(m => m.UploadedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync();

        var ids = page.Select(m => m.Id).ToList();
        var reportCounts = await _db.MediaReports
            .Where(r => ids.Contains(r.MediaId) && r.Status == "Pending")
            .GroupBy(r => r.MediaId)
            .Select(g => new { MediaId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.MediaId, x => x.Count);

        return new PagedResultDTO<AdminMediaDTO>
        {
            Items = [.. page.Select(m => ToDto(m, reportCounts.GetValueOrDefault(m.Id, 0)))],
            Total = total,
            Skip = skip,
            Take = take,
        };
    }

    public async Task<AdminMediaDTO> SetMediaVisibilityAsync(string actorId, string mediaId, AdminMediaVisibilityDTO dto)
    {
        var media = await FindMediaAsync(mediaId);

        var wasHidden = !media.IsPublic;
        var before = Describe(media.IsPublic, media.ShowOnMediaPage);
        media.IsPublic = dto.IsPublic;
        media.ShowOnMediaPage = dto.ShowOnMediaPage;
        await _db.SaveChangesAsync();

        await LogAsync(actorId, AdminAction.MediaVisibility, "Media", media.Id.ToString(), media.FileName,
            before + " → " + Describe(dto.IsPublic, dto.ShowOnMediaPage) + ReasonSuffix(dto.Reason)
            + " (owner: " + media.User?.Email + ")");

        // Only on a real transition. Saving the row twice with the same flags — which the UI can do
        // by toggling ShowOnMediaPage alone — must not mail the owner a takedown notice again.
        if (!wasHidden && !dto.IsPublic)
            await NotifyOwnerAsync(media, e => e.SendMediaHiddenAsync(
                media.User!.Email!, DisplayNameFor(media.User), FileLabel(media), dto.Reason));
        else if (wasHidden && dto.IsPublic)
            await NotifyOwnerAsync(media, e => e.SendMediaRestoredAsync(
                media.User!.Email!, DisplayNameFor(media.User), FileLabel(media)));

        return ToDto(media, await PendingReportsAsync(media.Id));
    }

    public async Task<AdminMediaDTO> SetMediaDownloadableAsync(string actorId, string mediaId, AdminSetFlagDTO dto)
    {
        var media = await FindMediaAsync(mediaId);

        media.Downloadable = dto.Value;
        await _db.SaveChangesAsync();

        await LogAsync(actorId, AdminAction.MediaDownloadable, "Media", media.Id.ToString(), media.FileName,
            dto.Value ? "download offered" : "download withdrawn");

        return ToDto(media, await PendingReportsAsync(media.Id));
    }

    public async Task DeleteMediaAsync(string actorId, string mediaId, string? reason)
    {
        var media = await FindMediaAsync(mediaId);
        var label = media.FileName;
        var size = media.FileSize;

        // Everything the notification needs is read now. After the delete the row is gone, and with
        // it the address to send to and the name to greet.
        var ownerEmail = media.User?.Email;
        var ownerName = media.User is null ? "there" : DisplayNameFor(media.User);
        var fileLabel = FileLabel(media);

        // Logged first, for the same reason as deleting an account: afterwards the file name and
        // the owner are gone and there is nothing left to write down.
        await LogAsync(actorId, AdminAction.DeleteMedia, "Media", media.Id.ToString(), label,
            Bytes(size) + " deleted permanently" + ReasonSuffix(reason) + " (owner: " + ownerEmail + ")");

        await _mediaService.DeleteMediaAsAdminAsync(mediaId);

        // Only once the delete has actually succeeded. Mailing "your file is gone" before the fact
        // and then failing leaves the owner looking for something that is still there.
        if (!string.IsNullOrWhiteSpace(ownerEmail))
            await TryMailAsync(() => _email.SendMediaDeletedAsync(ownerEmail, ownerName, fileLabel, reason),
                "deletion", mediaId);
    }

    // ── Plans ──────────────────────────────────────────────

    public async Task<IEnumerable<AdminPlanDTO>> GetPlansAsync()
        => await _db.Plans.AsNoTracking()
            .OrderBy(p => p.Price)
            .Select(p => new AdminPlanDTO
            {
                Id = p.Id,
                Name = p.Name,
                Description = p.Description,
                StorageLimitMB = p.StorageLimitMB,
                BandwidthMB = p.BandwidthMB,
                Price = p.Price,
                AllowDownloads = p.AllowDownloads,
                UserCount = _db.Users.Count(u => u.PlanId == p.Id),
            })
            .ToListAsync();

    public async Task<AdminPlanDTO> UpdatePlanAsync(string actorId, int planId, AdminUpdatePlanDTO dto)
    {
        var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Id == planId)
            ?? throw new NotFoundException("Plan not found.");

        if (dto.StorageLimitMB < 0 || dto.BandwidthMB < 0 || dto.Price < 0)
            throw new ValidationException("Limits and price can't be negative.");

        var before = Summarise(plan.StorageLimitMB, plan.BandwidthMB, plan.Price, plan.AllowDownloads);

        plan.Description = Trim(dto.Description, 1000);
        plan.StorageLimitMB = dto.StorageLimitMB;
        plan.BandwidthMB = dto.BandwidthMB;
        plan.Price = dto.Price;
        plan.AllowDownloads = dto.AllowDownloads;
        await _db.SaveChangesAsync();

        // Nothing re-quotas existing subscribers. Their allowance was set when the plan was assigned
        // and stays there until their next assignment or renewal — an edit here must not
        // retroactively shrink storage somebody has already filled.
        await LogAsync(actorId, AdminAction.UpdatePlan, "Plan", plan.Id.ToString(), plan.Name,
            before + " → " + Summarise(dto.StorageLimitMB, dto.BandwidthMB, dto.Price, dto.AllowDownloads));

        return (await GetPlansAsync()).First(p => p.Id == planId);
    }

    // ── Audit log ──────────────────────────────────────────

    public async Task<PagedResultDTO<AdminAuditLogDTO>> GetAuditLogAsync(int skip, int take)
    {
        skip = Math.Max(0, skip);
        take = Math.Clamp(take, 1, MaxPageSize);

        var total = await _db.AdminAuditLogs.CountAsync();

        var items = await _db.AdminAuditLogs.AsNoTracking()
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Skip(skip)
            .Take(take)
            .Select(a => new AdminAuditLogDTO
            {
                Id = a.Id,
                ActorEmail = a.ActorEmail,
                Action = a.Action,
                TargetType = a.TargetType,
                TargetId = a.TargetId,
                TargetLabel = a.TargetLabel,
                Detail = a.Detail,
                CreatedAt = a.CreatedAt,
            })
            .ToListAsync();

        return new PagedResultDTO<AdminAuditLogDTO> { Items = items, Total = total, Skip = skip, Take = take };
    }

    // ── Internals ──────────────────────────────────────────

    private async Task<ApplicationUser> FindUserAsync(string userId)
        => await _db.Users.FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new NotFoundException("User not found.");

    private async Task<Media> FindMediaAsync(string mediaId)
    {
        if (!Guid.TryParse(mediaId, out var id)) throw new ValidationException("Invalid media id.");
        return await _db.Media.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == id)
            ?? throw new NotFoundException("Media not found.");
    }

    private async Task<List<string>> RolesOfAsync(string userId)
        => await (from ur in _db.UserRoles
                  join r in _db.Roles on ur.RoleId equals r.Id
                  where ur.UserId == userId
                  select r.Name!).ToListAsync();

    private Task<int> PendingReportsAsync(Guid mediaId)
        => _db.MediaReports.CountAsync(r => r.MediaId == mediaId && r.Status == "Pending");

    /// <summary>
    /// Blocks any change that would leave the platform with no administrator. Counted from the role
    /// table at the moment of the change rather than cached, because the case worth catching is two
    /// admins demoting each other.
    /// </summary>
    private async Task EnsureNotLastAdminAsync(string userId, string verb)
    {
        var isAdmin = await (from ur in _db.UserRoles
                             join r in _db.Roles on ur.RoleId equals r.Id
                             where ur.UserId == userId && r.Name == "Admin"
                             select ur.UserId).AnyAsync();
        if (!isAdmin) return;

        var adminCount = await (from ur in _db.UserRoles
                                join r in _db.Roles on ur.RoleId equals r.Id
                                where r.Name == "Admin"
                                select ur.UserId).Distinct().CountAsync();

        if (adminCount <= 1)
            throw new ValidationException("This is the only administrator — you can't " + verb + " them.");
    }

    private async Task TryDeleteObjectAsync(string key)
    {
        try
        {
            await _s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = _bucket, Key = key });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not delete object {Key} during admin cleanup.", key);
        }
    }

    /// <summary>
    /// Writes the audit row, in its own SaveChanges so it lands whether or not the caller has
    /// already saved — and never batched behind a later failure, which would lose the record of a
    /// change that did happen.
    /// </summary>
    private async Task LogAsync(
        string actorId, string action, string targetType, string targetId, string? targetLabel, string? detail)
    {
        var actorEmail = await _db.Users.Where(u => u.Id == actorId).Select(u => u.Email).FirstOrDefaultAsync();

        _db.AdminAuditLogs.Add(new AdminAuditLog
        {
            ActorUserId = actorId,
            ActorEmail = actorEmail,
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            TargetLabel = Trim(targetLabel, 300),
            Detail = Trim(detail, 500),
            CreatedAt = DateTime.UtcNow,
        });

        await _db.SaveChangesAsync();
    }

    private static void Check(IdentityResult result)
    {
        if (result.Succeeded) return;
        throw new ValidationException(string.Join(" ", result.Errors.Select(e => e.Description)));
    }

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    private static string ReasonSuffix(string? reason)
        => string.IsNullOrWhiteSpace(reason) ? "" : " — " + Trim(reason, 200);

    private static string Signed(long bytes) => bytes >= 0 ? "+" + Bytes(bytes) : "-" + Bytes(-bytes);

    private static string Bytes(long value)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double size = value;
        var i = 0;
        while (size >= 1024 && i < units.Length - 1) { size /= 1024; i++; }
        return size.ToString("0.##") + " " + units[i];
    }

    private static string Summarise(long storageMb, long bandwidthMb, long price, bool allowDownloads)
        => storageMb + "MB / " + bandwidthMb + "MB / " + price + "c / downloads " + allowDownloads;

    private static string Describe(bool isPublic, bool onGallery)
        => isPublic ? (onGallery ? "public" : "public, off gallery") : "private";

    /// <summary>How to greet the owner. UserName is their email address here, so it is never used.</summary>
    private static string DisplayNameFor(ApplicationUser user)
        => !string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName!
         : !string.IsNullOrWhiteSpace(user.Handle) ? user.Handle!
         : "there";

    /// <summary>What to call the file in a mail. Untitled uploads still need naming in a sentence.</summary>
    private static string FileLabel(Media media)
        => string.IsNullOrWhiteSpace(media.FileName) ? "an untitled file" : media.FileName!;

    /// <summary>Mails the owner about a change already made to their file, if we can reach them.</summary>
    private async Task NotifyOwnerAsync(Media media, Func<IEmailService, Task> send)
    {
        if (string.IsNullOrWhiteSpace(media.User?.Email)) return;
        await TryMailAsync(() => send(_email), "visibility change", media.Id.ToString());
    }

    /// <summary>
    /// Sends, and swallows a failure.
    ///
    /// The moderation decision is already committed by the time this runs, so throwing would report
    /// failure for an action that succeeded — and the caller would very likely retry it, hiding the
    /// file twice and mailing twice. A mail provider being down is a logged problem, not a reason to
    /// leave harmful media up.
    /// </summary>
    private async Task TryMailAsync(Func<Task> send, string what, string mediaId)
    {
        try
        {
            await send();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not email the owner about the {What} of media {MediaId}.", what, mediaId);
        }
    }

    private static AdminUserDTO ToDto(ApplicationUser u, List<string> roles, int mediaCount) => new()
    {
        Id = u.Id,
        Email = u.Email,
        UserName = u.UserName,
        Handle = u.Handle,
        DisplayName = u.DisplayName,
        CreatedAt = u.CreatedAt,
        PlanName = u.Plan?.Name,
        PlanExpiration = u.PlanExpiration,
        UsedMemory = u.UsedMemory ?? 0,
        BuyedMemory = u.BuyedMemory,
        BonusMemory = u.BonusMemory ?? 0,
        UsedBandwidth = u.UsedBandwidth ?? 0,
        BuyedBandwidth = u.BuyedBandwidth,
        BonusBandwidth = u.BonusBandwidth ?? 0,
        BandwidthCycleStart = u.BandwidthCycleStart,
        MediaCount = mediaCount,
        IsProfilePublic = u.IsProfilePublic,
        IsSuspended = u.SuspendedAt != null,
        SuspensionReason = u.SuspensionReason,
        Roles = roles,
    };

    private AdminMediaDTO ToDto(Media m, int pendingReports) => new()
    {
        Id = m.Id,
        FileName = m.FileName,
        ContentType = m.ContentType,
        FileSize = m.FileSize,
        UploadedAt = m.UploadedAt,
        Status = m.Status,
        IsPublic = m.IsPublic,
        ShowOnMediaPage = m.ShowOnMediaPage,
        Downloadable = m.Downloadable,
        IsProfileAsset = m.IsProfileAsset,
        OwnerId = m.UserId,
        OwnerEmail = m.User?.Email,
        OwnerHandle = m.User?.Handle,
        // Unmetered on purpose: an admin scanning a list of files must not charge the owner's
        // bandwidth for every thumbnail that scrolls past.
        ThumbnailUrl = string.IsNullOrEmpty(m.ThumbnailUrl) ? null : Presign(m.ThumbnailUrl),
        PendingReports = pendingReports,
    };

    private string Presign(string key)
        => _s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = _bucket,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddMinutes(15),
        });
}
