using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

/// <summary>
/// A presigned PUT that has been handed out but not yet confirmed. Without this row an object can
/// reach the bucket and never get a Media row — abandoned uploads, rejected confirmations, closed
/// tabs — leaving storage nobody can see, bill or delete. The sweeper uses these rows to tell
/// "still in flight" from "orphaned", and the UserId binds the key to whoever asked for it so one
/// account can't confirm another's upload as its own.
/// </summary>
public class PendingUpload
{
    /// <summary>The storage key / future Media id.</summary>
    [Key]
    public Guid Id { get; set; }

    public string UserId { get; set; } = default!;
    public ApplicationUser User { get; set; } = default!;

    /// <summary>Content type promised at presign time; the confirm step must match it.</summary>
    [MaxLength(100)]
    public string ContentType { get; set; } = string.Empty;

    /// <summary>True when this key is a profile avatar/banner rather than a library upload.</summary>
    public bool IsProfileAsset { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the presigned URL stops working — after this the key is either confirmed or junk.</summary>
    public DateTime ExpiresAt { get; set; }
}
