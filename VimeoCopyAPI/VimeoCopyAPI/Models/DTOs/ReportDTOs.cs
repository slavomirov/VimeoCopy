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

    // ── Who reported it ────────────────────────────────────
    /// <summary>
    /// The reporter's public name, or null when the report was filed anonymously — reporting does
    /// not require an account, deliberately, so "nobody" is a real and common answer here.
    /// </summary>
    public string? ReporterName { get; set; }

    public string? ReporterHandle { get; set; }

    /// <summary>
    /// The reporter's email. This DTO is served to administrators only, who already see the
    /// owner's address on the same row — it is what makes a follow-up question possible, and what
    /// separates a good-faith report from an account filing dozens of them.
    /// </summary>
    public string? ReporterEmail { get; set; }

    /// <summary>
    /// How many reports this account has ever filed. A single number that turns "is this credible"
    /// from a guess into something the row already answers.
    /// </summary>
    public int ReporterTotalReports { get; set; }
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
