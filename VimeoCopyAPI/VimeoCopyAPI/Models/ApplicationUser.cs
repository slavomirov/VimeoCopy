using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;
using System.Collections.Generic;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;

namespace VimeoCopyAPI.Models;

public class ApplicationUser : IdentityUser
{
    public long? UsedMemory { get; set; }
    public long? BuyedMemory { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // one user -> many media
    public ICollection<Media> Media { get; set; } = new List<Media>();

    public Plan? Plan { get; set; }
    public int? PlanId { get; set; }
    public DateTime? PlanExpiration { get; set; }
}
