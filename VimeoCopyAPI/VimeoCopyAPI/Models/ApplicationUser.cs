using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;
using System.Collections.Generic;
using VimeoCopyApi.Models;

namespace VimeoCopyAPI.Models;

public class ApplicationUser : IdentityUser
{
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // one user -> many media
    public ICollection<Media> Media { get; set; } = new List<Media>();
}
