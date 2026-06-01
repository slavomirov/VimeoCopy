using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IPlanService
{
    Task EnsurePlanExists();
    Task<Plan?> GetPlayByNameAsync(string name);
    Task<BandwidthAddon?> GetBandwidthAddonByNameAsync(string name);
    Task<IEnumerable<BandwidthAddon>> GetBandwidthAddonsAsync();
}