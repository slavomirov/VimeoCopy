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

}
