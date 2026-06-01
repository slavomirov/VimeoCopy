using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IReportService
{
    Task CreateAsync(ReportCreateDTO dto, string? reporterUserId);
    Task<IEnumerable<ReportDTO>> GetPendingAsync();
    Task ResolveAsync(long reportId, string action, string reviewerUserId);
}
