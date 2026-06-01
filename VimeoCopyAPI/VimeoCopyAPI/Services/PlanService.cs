using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using System.Net.Sockets;
using System.Security.Claims;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class PlanService : IPlanService
{
    private readonly AppDbContext _dbContext;

    public PlanService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Plan?> GetPlayByNameAsync(string name) => await _dbContext.Plans.Where(x => x.Name.Equals(name)).FirstOrDefaultAsync();

    public async Task<BandwidthAddon?> GetBandwidthAddonByNameAsync(string name)
        => await _dbContext.BandwidthAddons.FirstOrDefaultAsync(a => a.Name == name);

    public async Task<IEnumerable<BandwidthAddon>> GetBandwidthAddonsAsync()
        => await _dbContext.BandwidthAddons.OrderBy(a => a.BandwidthMB).ToListAsync();

    public async Task EnsurePlanExists()
    {
        var plans = await _dbContext.Plans.ToListAsync();

        if (!plans.Any(p => p.Name == "Free"))
        {
            _dbContext.Plans.Add(new Plan
            {
                Name = "Free",
                Description = "Free Plan",
                StorageLimitMB = 10240, // 10 GB
                BandwithMB = 30720, // 30 GB
                Price = 0
            });
        }

        if (!plans.Any(p => p.Name == "Silver"))
        {
            _dbContext.Plans.Add(new Plan
            {
                Name = "Silver",
                Description = "Silver Plan",
                StorageLimitMB = 204800, //200 GB
                BandwithMB = 819200, //800 GB
                Price = 1500 // $15.00
            });
        }

        if (!plans.Any(p => p.Name == "Gold"))
        {
            _dbContext.Plans.Add(new Plan
            {
                Name = "Gold",
                Description = "Gold Plan",
                StorageLimitMB = 1048576, //1 TB
                BandwithMB = 2097152, //2 TB
                Price = 3500 // $35.00
            });
        }

        if (!plans.Any(p => p.Name == "Platinum"))
        {
            _dbContext.Plans.Add(new Plan
            {
                Name = "Platinum",
                Description = "Platinum Plan",
                StorageLimitMB = 2097152, //2 TB
                BandwithMB = 4194304, //4 TB
                Price = 6000 // $60.00
            });
        }

        var addons = await _dbContext.BandwidthAddons.ToListAsync();

        if (!addons.Any(a => a.Name == "Bandwidth-50GB"))
        {
            _dbContext.BandwidthAddons.Add(new BandwidthAddon
            {
                Name = "Bandwidth-50GB",
                Description = "+50 GB bandwidth top-up",
                BandwidthMB = 51200,
                Price = 300 // €3.00
            });
        }

        if (!addons.Any(a => a.Name == "Bandwidth-200GB"))
        {
            _dbContext.BandwidthAddons.Add(new BandwidthAddon
            {
                Name = "Bandwidth-200GB",
                Description = "+200 GB bandwidth top-up",
                BandwidthMB = 204800,
                Price = 1000 // €10.00
            });
        }

        if (!addons.Any(a => a.Name == "Bandwidth-1TB"))
        {
            _dbContext.BandwidthAddons.Add(new BandwidthAddon
            {
                Name = "Bandwidth-1TB",
                Description = "+1 TB bandwidth top-up",
                BandwidthMB = 1048576,
                Price = 4000 // €40.00
            });
        }

        await _dbContext.SaveChangesAsync();
    }
}