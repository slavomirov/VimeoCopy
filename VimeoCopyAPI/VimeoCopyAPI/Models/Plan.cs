using System.ComponentModel.DataAnnotations;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Models;

public class Plan
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; }

    [Required]
    public long StorageLimitInBytes { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }

    public ICollection<ApplicationUser> Users { get; set; } = [];
}
