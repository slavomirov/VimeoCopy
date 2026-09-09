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
    /// Authorisation is the controller's — every outcome here needs the same authority, because
    /// Admin is the only staff role on this platform.
    ///
    /// "remove" also sets Media.StaffHidden, which is what stops the owner simply publishing it
    /// again; their way back is an appeal through IRepublishService.
    /// </summary>
    Task ResolveAsync(long reportId, string action, string reviewerUserId, string? reason = null);
}
