using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IAnalyticsService
{
    /// <summary>Audience analytics for the given owner, derived from the bandwidth/view log.</summary>
    Task<AudienceOverviewDTO> GetAudienceOverviewAsync(string ownerUserId);
}
