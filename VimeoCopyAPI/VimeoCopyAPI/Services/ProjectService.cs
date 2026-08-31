using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyApi.Models;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Services;

public class ProjectService : IProjectService
{
    private readonly AppDbContext _db;

    public ProjectService(AppDbContext db)
    {
        _db = db;
    }

    // ── List ───────────────────────────────────────────────

    public async Task<List<ProjectSummaryDTO>> GetUserProjectsAsync(string userId)
    {
        return await _db.Projects
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new ProjectSummaryDTO
            {
                Id = p.Id,
                Title = p.Title,
                Description = p.Description,
                ThumbnailMediaId = p.ThumbnailMediaId,
                MediaCount = p.ProjectMedias.Count,
                CreatedAt = p.CreatedAt,
                UpdatedAt = p.UpdatedAt,
            })
            .ToListAsync();
    }

    // ── Detail ─────────────────────────────────────────────

    public async Task<ProjectDetailDTO> GetProjectDetailAsync(Guid projectId, string userId)
    {
        var project = await _db.Projects
            .Include(p => p.ProjectMedias)
                .ThenInclude(pm => pm.Media)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new NotFoundException("Project not found.");

        return MapToDetail(project);
    }

    // ── Create ─────────────────────────────────────────────

    public async Task<ProjectDetailDTO> CreateProjectAsync(CreateProjectDTO dto, string userId)
    {
        var project = new Project
        {
            Id = Guid.NewGuid(),
            Title = dto.Title,
            Description = dto.Description,
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.Projects.Add(project);

        // Attach initial media if provided
        if (dto.MediaIds is { Count: > 0 })
        {
            var ownedMediaIds = await _db.Media
                .Where(m => dto.MediaIds.Contains(m.Id) && m.UserId == userId && !m.IsProfileAsset)
                .Select(m => m.Id)
                .ToListAsync();

            for (int i = 0; i < ownedMediaIds.Count; i++)
            {
                _db.ProjectMedias.Add(new ProjectMedia
                {
                    ProjectId = project.Id,
                    MediaId = ownedMediaIds[i],
                    SortOrder = i,
                });
            }

            if (dto.ThumbnailMediaId.HasValue && ownedMediaIds.Contains(dto.ThumbnailMediaId.Value))
            {
                project.ThumbnailMediaId = dto.ThumbnailMediaId.Value;
            }
        }

        await _db.SaveChangesAsync();

        return await GetProjectDetailAsync(project.Id, userId);
    }

    // ── Update ─────────────────────────────────────────────

    public async Task<ProjectDetailDTO> UpdateProjectAsync(Guid projectId, UpdateProjectDTO dto, string userId)
    {
        var project = await _db.Projects
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new NotFoundException("Project not found.");

        if (dto.Title is not null)
            project.Title = dto.Title;

        if (dto.Description is not null)
            project.Description = dto.Description;

        if (dto.ThumbnailMediaId.HasValue)
        {
            // Verify the media belongs to this project
            var exists = await _db.ProjectMedias
                .AnyAsync(pm => pm.ProjectId == projectId && pm.MediaId == dto.ThumbnailMediaId.Value);
            if (exists)
                project.ThumbnailMediaId = dto.ThumbnailMediaId.Value;
        }

        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return await GetProjectDetailAsync(project.Id, userId);
    }

    // ── Delete ─────────────────────────────────────────────

    public async Task DeleteProjectAsync(Guid projectId, string userId)
    {
        var project = await _db.Projects
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new NotFoundException("Project not found.");

        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
    }

    // ── Add media ──────────────────────────────────────────

    public async Task<ProjectDetailDTO> AddMediaAsync(Guid projectId, AddMediaToProjectDTO dto, string userId)
    {
        var project = await _db.Projects
            .Include(p => p.ProjectMedias)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new NotFoundException("Project not found.");

        var existingIds = project.ProjectMedias.Select(pm => pm.MediaId).ToHashSet();
        int maxSort = project.ProjectMedias.Any() ? project.ProjectMedias.Max(pm => pm.SortOrder) : -1;

        var ownedMediaIds = await _db.Media
            .Where(m => dto.MediaIds.Contains(m.Id) && m.UserId == userId && !m.IsProfileAsset)
            .Select(m => m.Id)
            .ToListAsync();

        foreach (var mediaId in ownedMediaIds)
        {
            if (existingIds.Contains(mediaId)) continue;

            _db.ProjectMedias.Add(new ProjectMedia
            {
                ProjectId = projectId,
                MediaId = mediaId,
                SortOrder = ++maxSort,
            });
        }

        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return await GetProjectDetailAsync(projectId, userId);
    }

    // ── Remove media ───────────────────────────────────────

    public async Task<ProjectDetailDTO> RemoveMediaAsync(Guid projectId, RemoveMediaFromProjectDTO dto, string userId)
    {
        var project = await _db.Projects
            .Include(p => p.ProjectMedias)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new NotFoundException("Project not found.");

        var toRemove = project.ProjectMedias
            .Where(pm => dto.MediaIds.Contains(pm.MediaId))
            .ToList();

        _db.ProjectMedias.RemoveRange(toRemove);

        // Clear thumbnail if it was removed
        if (project.ThumbnailMediaId.HasValue && dto.MediaIds.Contains(project.ThumbnailMediaId.Value))
            project.ThumbnailMediaId = null;

        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return await GetProjectDetailAsync(projectId, userId);
    }

    // ── Reorder ────────────────────────────────────────────

    public async Task<ProjectDetailDTO> ReorderMediaAsync(Guid projectId, ReorderProjectMediaDTO dto, string userId)
    {
        var project = await _db.Projects
            .Include(p => p.ProjectMedias)
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId)
            ?? throw new NotFoundException("Project not found.");

        var lookup = project.ProjectMedias.ToDictionary(pm => pm.MediaId);

        for (int i = 0; i < dto.MediaIds.Count; i++)
        {
            if (lookup.TryGetValue(dto.MediaIds[i], out var pm))
                pm.SortOrder = i;
        }

        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return await GetProjectDetailAsync(projectId, userId);
    }

    // ── Helper ─────────────────────────────────────────────

    private static ProjectDetailDTO MapToDetail(Project project)
    {
        return new ProjectDetailDTO
        {
            Id = project.Id,
            Title = project.Title,
            Description = project.Description,
            ThumbnailMediaId = project.ThumbnailMediaId,
            CreatedAt = project.CreatedAt,
            UpdatedAt = project.UpdatedAt,
            Media = project.ProjectMedias
                .OrderBy(pm => pm.SortOrder)
                .Select(pm => new ProjectMediaItemDTO
                {
                    Id = pm.Media.Id,
                    ContentType = pm.Media.ContentType,
                    FileSize = pm.Media.FileSize,
                    UploadedAt = pm.Media.UploadedAt,
                    IsPublic = pm.Media.IsPublic,
                    SortOrder = pm.SortOrder,
                    HasThumbnail = !string.IsNullOrEmpty(pm.Media.ThumbnailUrl),
                })
                .ToList(),
        };
    }
}
