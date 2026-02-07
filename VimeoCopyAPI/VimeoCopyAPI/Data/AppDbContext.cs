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
    }
}
