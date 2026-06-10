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
                BandwidthMB = 30720, // 30 GB
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
                BandwidthMB = 819200, //800 GB
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
                BandwidthMB = 2097152, //2 TB
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
                BandwidthMB = 4194304, //4 TB
                Price = 6000 // $60.00
            });
        }

        await _dbContext.SaveChangesAsync();
    }
}