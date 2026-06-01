namespace VimeoCopyAPI.Models;

public enum BandwidthSource
{
    Owner = 0,
    Public = 1,
    Shared = 2,
    Embed = 3,
}

public class BandwidthLog
{
    public long Id { get; set; }

    /// <summary>Owner whose quota is charged.</summary>
    public string OwnerUserId { get; set; } = default!;

    public Guid MediaId { get; set; }

    /// <summary>Bytes counted for this view (typically media.FileSize at presign time).</summary>
    public long Bytes { get; set; }

    /// <summary>SHA-256 of viewer IP for anonymous de-dup. Null when viewer is authenticated.</summary>
    public string? ViewerIpHash { get; set; }

    /// <summary>Authenticated viewer's user id. Null for anonymous.</summary>
    public string? ViewerUserId { get; set; }

    /// <summary>UTC hour bucket "yyyyMMddHH" used together with viewer key to de-dup.</summary>
    public string HourBucket { get; set; } = default!;

    public BandwidthSource Source { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
