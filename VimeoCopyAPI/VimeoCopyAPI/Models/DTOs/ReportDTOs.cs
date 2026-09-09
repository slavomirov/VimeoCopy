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
    /// <summary>
    /// "remove" hides the media (private), "delete" destroys it for good, "dismiss" closes the
    /// report and leaves the file alone. Only "delete" is restricted to administrators — see
    /// ReportController.
    /// </summary>
    public string Action { get; set; } = default!;

    /// <summary>
    /// Why, in the owner's words-to-be: it is quoted verbatim in the email they get. Optional, but
    /// a takedown with no reason is the one that comes back as a support ticket.
    /// </summary>
    public string? Reason { get; set; }
}
