using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IReportService
{
    Task CreateAsync(ReportCreateDTO dto, string? reporterUserId);
    Task<IEnumerable<ReportDTO>> GetPendingAsync();
    /// <summary>
    /// Closes a report. "remove" makes the media private, "delete" destroys it permanently, and
    /// anything else dismisses the report untouched. The first two email the owner; a takedown they
    /// are never told about is indistinguishable to them from the site being broken.
    ///
    /// This method does NOT check that the caller may delete — the controller does, because "delete"
    /// is administrator-only while the rest of the endpoint is open to moderators.
    /// </summary>
    Task ResolveAsync(long reportId, string action, string reviewerUserId, string? reason = null);
}
