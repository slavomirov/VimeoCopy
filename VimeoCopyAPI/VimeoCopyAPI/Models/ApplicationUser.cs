using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

public class ApplicationUser : IdentityUser
{
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
