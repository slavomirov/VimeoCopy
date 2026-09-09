namespace VimeoCopyAPI.Models.DTOs;

/// <summary>What an owner sends to appeal a takedown.</summary>
public class CreateRepublishRequestDTO
{
    public Guid MediaId { get; set; }

    /// <summary>Their case for putting it back. Required — an appeal with no argument is noise.</summary>
    public string Reason { get; set; } = default!;
}

/// <summary>
/// One appeal, as staff and the owner both see it. The same shape serves the staff inbox and the
/// owner's own view of where their appeal got to.
/// </summary>
public class RepublishRequestDTO
{
    public long Id { get; set; }
    public Guid MediaId { get; set; }

    public string? FileName { get; set; }
    public string? ContentType { get; set; }
    public long FileSize { get; set; }

    /// <summary>Presigned thumbnail, so staff can see what they are deciding about.</summary>
    public string? ThumbnailUrl { get; set; }

    /// <summary>Public identity of the owner appealing.</summary>
    public string OwnerName { get; set; } = default!;
    public string? OwnerHandle { get; set; }

    /// <summary>The owner's address. Staff-facing list only, like the report inbox.</summary>
    public string? OwnerEmail { get; set; }

    /// <summary>Why staff hid it in the first place, so the appeal can be read against it.</summary>
    public string? StaffHiddenReason { get; set; }

    /// <summary>Reports still open against this file. A live report is a reason to think twice.</summary>
    public int PendingReports { get; set; }

    public string Reason { get; set; } = default!;
    public string Status { get; set; } = default!;
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
    public string? DecisionNote { get; set; }
}

/// <summary>Staff's answer to an appeal.</summary>
public class DecideRepublishRequestDTO
{
    public bool Approve { get; set; }

    /// <summary>
    /// What to tell the owner. Optional on an approval, where the outcome speaks for itself; worth
    /// writing on a refusal, because a "no" with no reason is what produces a third appeal.
    /// </summary>
    public string? Note { get; set; }
}
