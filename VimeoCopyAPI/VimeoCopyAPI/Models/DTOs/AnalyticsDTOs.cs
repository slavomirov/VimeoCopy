namespace VimeoCopyAPI.Models.DTOs;

public class AudienceOverviewDTO
{
    public long TotalViews { get; set; }
    public int UniqueViewers { get; set; }
    public long TotalBytes { get; set; }
    public List<DailyViewsDTO> ViewsByDay { get; set; } = [];
    public List<TopMediaDTO> TopMedia { get; set; } = [];
    public List<SourceBreakdownDTO> BySource { get; set; } = [];
}

public class DailyViewsDTO
{
    public string Date { get; set; } = default!; // yyyy-MM-dd
    public int Views { get; set; }
}

public class TopMediaDTO
{
    public Guid MediaId { get; set; }
    public string? FileName { get; set; }
    public int Views { get; set; }
    public int UniqueViewers { get; set; }
}

public class SourceBreakdownDTO
{
    public string Source { get; set; } = default!;
    public int Views { get; set; }
}
