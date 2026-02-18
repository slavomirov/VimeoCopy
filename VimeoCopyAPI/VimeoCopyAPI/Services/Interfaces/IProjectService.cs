using VimeoCopyAPI.Models.DTOs;

namespace VimeoCopyAPI.Services.Interfaces;

public interface IProjectService
{
    Task<List<ProjectSummaryDTO>> GetUserProjectsAsync(string userId);
    Task<ProjectDetailDTO> GetProjectDetailAsync(Guid projectId, string userId);
    Task<ProjectDetailDTO> CreateProjectAsync(CreateProjectDTO dto, string userId);
    Task<ProjectDetailDTO> UpdateProjectAsync(Guid projectId, UpdateProjectDTO dto, string userId);
    Task DeleteProjectAsync(Guid projectId, string userId);
    Task<ProjectDetailDTO> AddMediaAsync(Guid projectId, AddMediaToProjectDTO dto, string userId);
    Task<ProjectDetailDTO> RemoveMediaAsync(Guid projectId, RemoveMediaFromProjectDTO dto, string userId);
    Task<ProjectDetailDTO> ReorderMediaAsync(Guid projectId, ReorderProjectMediaDTO dto, string userId);
}
