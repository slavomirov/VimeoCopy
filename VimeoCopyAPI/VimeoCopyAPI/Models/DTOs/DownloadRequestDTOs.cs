namespace VimeoCopyAPI.Models.DTOs;

/// <summary>What the requester sends: which file, and optionally why.</summary>
public class CreateDownloadRequestDTO
{
    public Guid MediaId { get; set; }

    /// <summary>Optional note to the owner. Trimmed and capped server-side.</summary>
    public string? Message { get; set; }
}

/// <summary>
/// One request, as either side sees it. The owner's inbox and the requester's outbox return the
/// same shape — which side is looking decides whether RequesterName or OwnerName is the useful one.
/// </summary>
public class DownloadRequestDTO
{
    public long Id { get; set; }

    public Guid MediaId { get; set; }

    /// <summary>Title of the file being asked for.</summary>
    public string? FileName { get; set; }
    public string? ContentType { get; set; }
    public long FileSize { get; set; }

    /// <summary>True when the file still has a stored thumbnail to show next to the row.</summary>
    public bool HasThumbnail { get; set; }

    /// <summary>Public identity of the person asking. Never their email address.</summary>
    public string RequesterName { get; set; } = default!;
    public string? RequesterHandle { get; set; }

    /// <summary>Public identity of the owner, for the requester's own list.</summary>
    public string OwnerName { get; set; } = default!;
    public string? OwnerHandle { get; set; }

    public string Status { get; set; } = default!;
    public string? Message { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
}

/// <summary>Counts for the nav badge, so the sidebar doesn't have to pull both lists.</summary>
public class DownloadRequestSummaryDTO
{
    /// <summary>Requests waiting on this user's decision.</summary>
    public int PendingIncoming { get; set; }

    /// <summary>This user's own requests that have been granted and not yet used up.</summary>
    public int ApprovedOutgoing { get; set; }

    /// <summary>This user's own requests still waiting for an answer.</summary>
    public int PendingOutgoing { get; set; }
}
