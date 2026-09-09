using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

/// <summary>
/// Everything an administrator can do to somebody else's account or files.
///
/// Two rules hold for every method here, and they are why this is one service rather than admin
/// flags sprinkled through the ordinary ones: authorisation is the controller's (Admin role, no
/// exceptions), and every mutation writes an <see cref="Models.AdminAuditLog"/> row before it
/// returns. A change that leaves no trace is the one nobody can explain later.
/// </summary>
public interface IAdminService
{
    Task<AdminOverviewDTO> GetOverviewAsync();

    /// <summary>
    /// Accounts matching a free-text search of email, handle and display name. Paged, because the
    /// user table is the one list here with no natural ceiling.
    /// </summary>
    Task<PagedResultDTO<AdminUserDTO>> SearchUsersAsync(string? query, int skip, int take);

    Task<AdminUserDTO> GetUserAsync(string userId);

    /// <summary>
    /// Puts a user on a plan without a payment. Reuses the ordinary plan assignment, so a granted
    /// plan behaves exactly like a bought one — same quotas, same download rights, same expiry
    /// arithmetic — and cannot drift from it.
    /// </summary>
    Task<AdminUserDTO> GrantPlanAsync(string actorId, string userId, AdminGrantPlanDTO dto);

    /// <summary>Adds (or, with a negative delta, takes back) bonus storage. Never lets the
    /// allowance fall below what the user is already using.</summary>
    Task<AdminUserDTO> GrantStorageAsync(string actorId, string userId, AdminGrantQuotaDTO dto);

    /// <summary>Adds or removes bonus bandwidth for the current cycle and every one after it.</summary>
    Task<AdminUserDTO> GrantBandwidthAsync(string actorId, string userId, AdminGrantQuotaDTO dto);

    /// <summary>Puts this cycle's usage back to zero — the support answer to "my videos stopped
    /// playing" that doesn't require handing over permanent extra allowance.</summary>
    Task<AdminUserDTO> ResetBandwidthAsync(string actorId, string userId);

    /// <summary>
    /// Replaces a user's roles. Refuses to strip the last remaining administrator, and refuses to
    /// let an admin demote themselves — both are one click away from locking everyone out.
    /// </summary>
    Task<AdminUserDTO> SetRolesAsync(string actorId, string userId, AdminSetRolesDTO dto);

    /// <summary>Blocks or restores sign-in. Suspending also revokes live refresh tokens, or the
    /// account keeps working until they happen to expire.</summary>
    Task<AdminUserDTO> SetSuspendedAsync(string actorId, string userId, AdminSuspendDTO dto);

    /// <summary>Takes a public profile out of search and direct access, or puts it back.</summary>
    Task<AdminUserDTO> SetProfileVisibilityAsync(string actorId, string userId, AdminSetFlagDTO dto);

    /// <summary>
    /// Deletes an account and everything it stored. Irreversible, so it refuses to touch the
    /// caller's own account or the last administrator.
    /// </summary>
    Task DeleteUserAsync(string actorId, string userId);

    /// <summary>
    /// Media across all accounts. <paramref name="ownerId"/> scopes it to one user's library;
    /// <paramref name="visibility"/> accepts "public", "private" or null for everything.
    /// </summary>
    Task<PagedResultDTO<AdminMediaDTO>> SearchMediaAsync(string? query, string? ownerId, string? visibility, int skip, int take);

    /// <summary>
    /// Hides a file from the gallery and from direct access, or restores it. Emails the owner on a
    /// real transition in either direction — a takedown they are not told about looks like a bug in
    /// the site, and a restore they are not told about leaves them checking.
    /// </summary>
    Task<AdminMediaDTO> SetMediaVisibilityAsync(string actorId, string mediaId, AdminMediaVisibilityDTO dto);

    /// <summary>Forces the download flag off (or on) over the owner's head.</summary>
    Task<AdminMediaDTO> SetMediaDownloadableAsync(string actorId, string mediaId, AdminSetFlagDTO dto);

    /// <summary>
    /// Removes a file for good — bucket objects included — refunds the owner, and tells them it
    /// happened. The mail goes out only after the delete succeeds.
    /// </summary>
    Task DeleteMediaAsync(string actorId, string mediaId, string? reason);

    Task<IEnumerable<AdminPlanDTO>> GetPlansAsync();

    /// <summary>
    /// Edits a plan's limits or price. Existing subscribers keep the allowance they were given
    /// until their next assignment — changing a tier must not silently re-quota live accounts.
    /// </summary>
    Task<AdminPlanDTO> UpdatePlanAsync(string actorId, int planId, AdminUpdatePlanDTO dto);

    Task<PagedResultDTO<AdminAuditLogDTO>> GetAuditLogAsync(int skip, int take);
}
