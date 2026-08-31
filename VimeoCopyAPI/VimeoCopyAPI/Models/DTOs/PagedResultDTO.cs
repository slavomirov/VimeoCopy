namespace VimeoCopyAPI.Models.DTOs;

/// <summary>A page of results plus what the caller needs to ask for the next one.</summary>
public class PagedResultDTO<T>
{
    public List<T> Items { get; set; } = [];

    /// <summary>Total matching rows, so the client can show a count and know when to stop.</summary>
    public int Total { get; set; }

    public int Skip { get; set; }
    public int Take { get; set; }

    public bool HasMore => Skip + Items.Count < Total;
}
