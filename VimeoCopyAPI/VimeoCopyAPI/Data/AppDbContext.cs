using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;

namespace VimeoCopyApi.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Media> Media { get; set; }
    public DbSet<RefreshToken> RefreshTokens { get; set; }
    public DbSet<Plan> Plans { get; set; }
    public DbSet<PlanNotification> PlanNotifications { get; set; }
    public DbSet<SharedLink> SharedLinks { get; set; }
    public DbSet<Project> Projects { get; set; }
    public DbSet<ProjectMedia> ProjectMedias { get; set; }
    public DbSet<BandwidthLog> BandwidthLogs { get; set; }
    public DbSet<BandwidthAddon> BandwidthAddons { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // explicit one-to-many: ApplicationUser (1) -> Media (many)
        modelBuilder.Entity<Media>()
            .HasOne(m => m.User)
            .WithMany(u => u.Media)
            .HasForeignKey(m => m.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ApplicationUser>()
            .HasOne(u => u.Plan)
            .WithMany(p => p.Users)
            .HasForeignKey(u => u.PlanId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<SharedLink>()
            .HasOne(sl => sl.Media)
            .WithMany()
            .HasForeignKey(sl => sl.MediaId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SharedLink>()
            .HasIndex(sl => sl.Token)
            .IsUnique();

        // Project -> User
        modelBuilder.Entity<Project>()
            .HasOne(p => p.User)
            .WithMany(u => u.Projects)
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // ProjectMedia join table
        modelBuilder.Entity<ProjectMedia>()
            .HasOne(pm => pm.Project)
            .WithMany(p => p.ProjectMedias)
            .HasForeignKey(pm => pm.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProjectMedia>()
            .HasOne(pm => pm.Media)
            .WithMany()
            .HasForeignKey(pm => pm.MediaId)
            .OnDelete(DeleteBehavior.NoAction); // avoid cascade cycle

        modelBuilder.Entity<ProjectMedia>()
            .HasIndex(pm => new { pm.ProjectId, pm.MediaId })
            .IsUnique();

        modelBuilder.Entity<BandwidthLog>()
            .HasIndex(b => new { b.MediaId, b.HourBucket });

        modelBuilder.Entity<BandwidthLog>()
            .HasIndex(b => new { b.OwnerUserId, b.CreatedAt });

        modelBuilder.Entity<BandwidthAddon>()
            .HasIndex(a => a.Name)
            .IsUnique();
    }
}
