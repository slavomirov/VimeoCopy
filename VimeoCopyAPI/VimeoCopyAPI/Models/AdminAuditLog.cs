using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

/// <summary>
/// One thing an administrator did, and to whom.
///
/// The admin surface hands out storage, bandwidth and paid plans for free, hides other people's
/// media and deletes accounts — every one of those is invisible afterwards unless it is written
/// down. A grant with no record is indistinguishable from a billing bug, so the log is not
/// optional decoration: it is what makes the power reviewable.
///
/// Append-only by construction — nothing in the service updates or deletes a row, and there is no
/// endpoint that does either.
/// </summary>
public class AdminAuditLog
{
    public long Id { get; set; }

    /// <summary>Who did it. Kept as a raw id, not a foreign key, so deleting the actor's account
    /// never erases what they did.</summary>
    [Required]
    [MaxLength(450)]
    public string ActorUserId { get; set; } = default!;

    /// <summary>Denormalised at write time for the same reason: the log has to stay readable after
    /// the account behind it is gone or renamed.</summary>
    [MaxLength(256)]
    public string? ActorEmail { get; set; }

    /// <summary>Machine-readable verb — see <see cref="AdminAction"/>.</summary>
    [Required]
    [MaxLength(60)]
    public string Action { get; set; } = default!;

    /// <summary>"User", "Media" or "Plan". Says how to read <see cref="TargetId"/>.</summary>
    [Required]
    [MaxLength(20)]
    public string TargetType { get; set; } = default!;

    [Required]
    [MaxLength(450)]
    public string TargetId { get; set; } = default!;

    /// <summary>Human-readable label for the target, frozen at write time — an email, a file name.</summary>
    [MaxLength(300)]
    public string? TargetLabel { get; set; }

    /// <summary>What changed, in words. The before/after belongs here, not in a diff table.</summary>
    [MaxLength(500)]
    public string? Detail { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>The verbs, in one place, so a log query never has to guess at a string literal.</summary>
public static class AdminAction
{
    public const string GrantPlan = "user.plan.grant";
    public const string GrantStorage = "user.storage.grant";
    public const string GrantBandwidth = "user.bandwidth.grant";
    public const string ResetBandwidth = "user.bandwidth.reset";
    public const string SetRoles = "user.roles.set";
    public const string Suspend = "user.suspend";
    public const string Unsuspend = "user.unsuspend";
    public const string SetProfileVisibility = "user.profile.visibility";
    public const string DeleteUser = "user.delete";
    public const string MediaVisibility = "media.visibility";
    public const string MediaDownloadable = "media.downloadable";
    public const string DeleteMedia = "media.delete";
    public const string UpdatePlan = "plan.update";
}
