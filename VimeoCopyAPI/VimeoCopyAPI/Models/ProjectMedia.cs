using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using VimeoCopyApi.Models;

namespace VimeoCopyAPI.Models;

/// <summary>
/// Join table between Project and Media (many-to-many).
/// Includes an ordering column so items can be arranged.
/// </summary>
public class ProjectMedia
{
    [Key]
    public int Id { get; set; }

    public Guid ProjectId { get; set; }

    [JsonIgnore]
    public Project Project { get; set; } = default!;

    public Guid MediaId { get; set; }

    [JsonIgnore]
    public Media Media { get; set; } = default!;

    /// <summary>Display order inside the project (0-based).</summary>
    public int SortOrder { get; set; }

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}
