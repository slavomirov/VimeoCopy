using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Models;

namespace VimeoCopyApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Media> Media { get; set; }
}
