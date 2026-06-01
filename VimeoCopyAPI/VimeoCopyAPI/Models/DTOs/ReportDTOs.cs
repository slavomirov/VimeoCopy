namespace VimeoCopyAPI.Models.DTOs;

public class ReportCreateDTO
{
    public Guid MediaId { get; set; }
    public string Reason { get; set; } = default!;
    public string? Details { get; set; }
}

public class ReportDTO
{
    public long Id { get; set; }
    public Guid MediaId { get; set; }
    public string? FileName { get; set; }
    public string Reason { get; set; } = default!;
    public string? Details { get; set; }
    public string Status { get; set; } = default!;
    public DateTime CreatedAt { get; set; }
    public bool MediaIsPublic { get; set; }
    public string? OwnerEmail { get; set; }
}

public class ResolveReportDTO
{
    /// <summary>"remove" hides the media (private); "dismiss" closes the report.</summary>
    public string Action { get; set; } = default!;
}
