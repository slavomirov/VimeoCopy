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
    public DbSet<MediaReport> MediaReports { get; set; }
    public DbSet<PasswordResetCode> PasswordResetCodes { get; set; }
    public DbSet<PendingUpload> PendingUploads { get; set; }
    public DbSet<ProcessedStripeEvent> ProcessedStripeEvents { get; set; }

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

        // Existing rows predate banner repositioning, so default them to a centred crop rather
        // than the 0 (top-aligned) a plain int column would backfill.
        modelBuilder.Entity<ApplicationUser>()
            .Property(u => u.BannerOffsetY)
            .HasDefaultValue(50);

        // Unique handle (filtered so multiple users may still have NULL handles)
        modelBuilder.Entity<ApplicationUser>()
            .HasIndex(u => u.Handle)
            .IsUnique()
            .HasFilter("[Handle] IS NOT NULL");

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

        modelBuilder.Entity<MediaReport>()
            .HasIndex(r => new { r.Status, r.CreatedAt });

        modelBuilder.Entity<PasswordResetCode>()
            .HasOne(c => c.User)
            .WithMany()
            .HasForeignKey(c => c.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Verification always looks up the newest unconsumed challenge for one user.
        modelBuilder.Entity<PasswordResetCode>()
            .HasIndex(c => new { c.UserId, c.CreatedAt });

        // The set-password step arrives carrying only a ticket, so it must be findable on its own.
        modelBuilder.Entity<PasswordResetCode>()
            .HasIndex(c => c.TicketHash)
            .HasFilter("[TicketHash] IS NOT NULL");

        modelBuilder.Entity<PendingUpload>()
            .HasOne(p => p.User)
            .WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // The sweeper scans for rows whose presign window has closed.
        modelBuilder.Entity<PendingUpload>()
            .HasIndex(p => p.ExpiresAt);

        // Refresh tokens are looked up by digest on every refresh; unique so a hash can't collide
        // across rows and hand a session to the wrong user.
        modelBuilder.Entity<RefreshToken>()
            .HasIndex(t => t.Token)
            .IsUnique();

        // Revocation and expiry are checked together when resolving a share token.
        modelBuilder.Entity<SharedLink>()
            .HasIndex(sl => new { sl.MediaId, sl.RevokedAt });
    }
}
