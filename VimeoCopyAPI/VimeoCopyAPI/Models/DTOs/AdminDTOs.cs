namespace VimeoCopyAPI.Models.DTOs;

/// <summary>The numbers on the admin landing tab — the shape of the platform at a glance.</summary>
public class AdminOverviewDTO
{
    public int TotalUsers { get; set; }
    public int SuspendedUsers { get; set; }
    public int NewUsers7d { get; set; }
    public int NewUsers30d { get; set; }

    public int TotalMedia { get; set; }
    public int PrivateMedia { get; set; }

    /// <summary>Bytes of stored media, summed from the files themselves rather than from the
    /// per-user counters — the counters are what drift, so this is the number worth showing.</summary>
    public long StoredBytes { get; set; }

    /// <summary>Bytes served this cycle, summed across accounts.</summary>
    public long BandwidthUsedBytes { get; set; }

    public int PendingReports { get; set; }
    public int PendingDownloadRequests { get; set; }

    /// <summary>Owners appealing a takedown and waiting on an answer.</summary>
    public int PendingRepublishRequests { get; set; }

    /// <summary>How many accounts sit on each plan, so a tier with nobody on it is visible.</summary>
    public List<AdminPlanUsageDTO> PlanUsage { get; set; } = [];
}

public class AdminPlanUsageDTO
{
    public string PlanName { get; set; } = default!;
    public int UserCount { get; set; }
}

/// <summary>One account in the admin user list.</summary>
public class AdminUserDTO
{
    public string Id { get; set; } = default!;
    public string? Email { get; set; }
    public string? UserName { get; set; }
    public string? Handle { get; set; }
    public string? DisplayName { get; set; }
    public DateTime CreatedAt { get; set; }

    public string? PlanName { get; set; }
    public DateTime? PlanExpiration { get; set; }

    /// <summary>All byte counts, because the database stores bytes and converting twice is how
    /// rounding errors get into a number somebody is about to make a decision on.</summary>
    public long UsedMemory { get; set; }
    public long? BuyedMemory { get; set; }
    public long BonusMemory { get; set; }
    public long UsedBandwidth { get; set; }
    public long? BuyedBandwidth { get; set; }
    public long BonusBandwidth { get; set; }
    public DateTime? BandwidthCycleStart { get; set; }

    public int MediaCount { get; set; }
    public bool IsProfilePublic { get; set; }
    public bool IsSuspended { get; set; }
    public string? SuspensionReason { get; set; }
    public List<string> Roles { get; set; } = [];
}

/// <summary>One file in the admin media list, with enough owner context to act on it.</summary>
public class AdminMediaDTO
{
    public Guid Id { get; set; }
    public string? FileName { get; set; }
    public string ContentType { get; set; } = default!;
    public long FileSize { get; set; }
    public DateTime UploadedAt { get; set; }
    public string Status { get; set; } = default!;
    public bool IsPublic { get; set; }
    public bool ShowOnMediaPage { get; set; }
    public bool Downloadable { get; set; }
    public bool IsProfileAsset { get; set; }
    public string OwnerId { get; set; } = default!;
    public string? OwnerEmail { get; set; }
    public string? OwnerHandle { get; set; }

    /// <summary>Unmetered preview URL, so the admin can see what they are about to hide or delete
    /// instead of deciding from a file name.</summary>
    public string? ThumbnailUrl { get; set; }

    /// <summary>Reports filed against this file and still unresolved.</summary>
    public int PendingReports { get; set; }
}

public class AdminPlanDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public long StorageLimitMB { get; set; }
    public long BandwidthMB { get; set; }
    public long Price { get; set; }
    public bool AllowDownloads { get; set; }
    public int UserCount { get; set; }
}

public class AdminAuditLogDTO
{
    public long Id { get; set; }
    public string? ActorEmail { get; set; }
    public string Action { get; set; } = default!;
    public string TargetType { get; set; } = default!;
    public string TargetId { get; set; } = default!;
    public string? TargetLabel { get; set; }
    public string? Detail { get; set; }
    public DateTime CreatedAt { get; set; }
}

// ── Request bodies ─────────────────────────────────────────

/// <summary>Give a user a plan without them paying for it.</summary>
public class AdminGrantPlanDTO
{
    public string PlanName { get; set; } = default!;

    /// <summary>How long the grant runs. Omitted means the plan's normal one month.</summary>
    public int? Months { get; set; }

    /// <summary>Why — goes straight into the audit log, so it is worth filling in.</summary>
    public string? Reason { get; set; }
}

/// <summary>
/// Move a user's bonus storage or bandwidth. A signed delta rather than an absolute, because the
/// action an admin takes is "give them another 50 GB", not "set their total to some number they
/// would have to work out first".
/// </summary>
public class AdminGrantQuotaDTO
{
    public long DeltaBytes { get; set; }
    public string? Reason { get; set; }
}

public class AdminSetRolesDTO
{
    public List<string> Roles { get; set; } = [];
}

public class AdminSuspendDTO
{
    public bool Suspended { get; set; }
    public string? Reason { get; set; }
}

public class AdminSetFlagDTO
{
    public bool Value { get; set; }
}

/// <summary>Both visibility flags at once — hiding a file usually means both.</summary>
public class AdminMediaVisibilityDTO
{
    public bool IsPublic { get; set; }
    public bool ShowOnMediaPage { get; set; }

    /// <summary>
    /// Why it was hidden. Goes to the owner in the notification email and into the audit log, so
    /// it is worth writing: "we hid your file" with no reason is the message that generates a
    /// support ticket. Ignored when the change makes a file public again.
    /// </summary>
    public string? Reason { get; set; }
}

public class AdminUpdatePlanDTO
{
    public string? Description { get; set; }
    public long StorageLimitMB { get; set; }
    public long BandwidthMB { get; set; }
    public long Price { get; set; }
    public bool AllowDownloads { get; set; }
}
