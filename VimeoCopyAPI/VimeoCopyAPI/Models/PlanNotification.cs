using System.ComponentModel.DataAnnotations;

namespace VimeoCopyAPI.Models;

public class PlanNotification
{
    [Key]
    public int Id { get; set; }

    [Required]
    public string UserId { get; set; }

    public ApplicationUser User { get; set; } = default!;

    [Required]
    public NotificationType Type { get; set; }

    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    public DateTime ExpirationCheckDate { get; set; }
}

public enum NotificationType
{
    ExpiringIn1Day,
    ExpiringIn3Days,
    Expired
}
