using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IPlanService
{
    Task EnsurePlanExists();
    Task<Plan?> GetPlayByNameAsync(string name);
}