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
    public DbSet<DownloadRequest> DownloadRequests { get; set; }

    public DbSet<AdminAuditLog> AdminAuditLogs { get; set; }

    public DbSet<RepublishRequest> RepublishRequests { get; set; }

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

        // The public gallery's exact query: the three visibility flags, newest first, paged with
        // OFFSET/FETCH. Media carried no index at all beyond the UserId foreign key, so this ran as
        // a table scan plus a sort on every page — survivable on a dev database, not at 10k rows
        // where the sort alone decides how long the first paint takes. The key order matches the
        // predicate (equality columns first) and ends on the sort column so the ORDER BY is free.
        modelBuilder.Entity<Media>()
            .HasIndex(m => new { m.IsPublic, m.ShowOnMediaPage, m.IsProfileAsset, m.UploadedAt })
            .HasDatabaseName("IX_Media_Gallery");

        // The owner's library and the public portfolio both filter by owner and order by date.
        modelBuilder.Entity<Media>()
            .HasIndex(m => new { m.UserId, m.UploadedAt })
            .HasDatabaseName("IX_Media_Owner_UploadedAt");

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

        // The owner's inbox: their pending requests, newest last. Also the shape the badge counts.
        modelBuilder.Entity<DownloadRequest>()
            .HasIndex(d => new { d.OwnerUserId, d.Status, d.CreatedAt });

        // Two lookups share this one: "has this viewer already asked for this file" on create, and
        // "may this viewer download this file" on every download.
        modelBuilder.Entity<DownloadRequest>()
            .HasIndex(d => new { d.MediaId, d.RequesterUserId, d.Status });

        // The showreel equivalent: "may this viewer download this owner's bundle". Showreel rows
        // carry no MediaId, so the index above can't serve them.
        modelBuilder.Entity<DownloadRequest>()
            .HasIndex(d => new { d.OwnerUserId, d.RequesterUserId, d.Kind, d.Status });

        // The log is read newest-first and never filtered by anything else.
        modelBuilder.Entity<AdminAuditLog>()
            .HasIndex(a => a.CreatedAt);

        // The staff inbox: pending appeals, oldest first.
        modelBuilder.Entity<RepublishRequest>()
            .HasIndex(r => new { r.Status, r.CreatedAt });

        // "Does this file already have a live appeal", checked on every submission.
        modelBuilder.Entity<RepublishRequest>()
            .HasIndex(r => new { r.MediaId, r.Status });

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
