using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectController : ControllerBase
{
    private readonly IProjectService _projectService;

    public ProjectController(IProjectService projectService)
    {
        _projectService = projectService;
    }

    private string GetUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User not authenticated.");

    /// <summary>List all projects for the logged-in user.</summary>
    [HttpGet]
    public async Task<IActionResult> GetMyProjects()
    {
        var userId = GetUserId();
        return Ok(await _projectService.GetUserProjectsAsync(userId));
    }

    /// <summary>Get project details including media list.</summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetProject(Guid id)
    {
        var userId = GetUserId();
        return Ok(await _projectService.GetProjectDetailAsync(id, userId));
    }

    /// <summary>Create a new project.</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateProjectDTO dto)
    {
        var userId = GetUserId();
        var result = await _projectService.CreateProjectAsync(dto, userId);
        return CreatedAtAction(nameof(GetProject), new { id = result.Id }, result);
    }

    /// <summary>Update project title, description, or thumbnail.</summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateProjectDTO dto)
    {
        var userId = GetUserId();
        return Ok(await _projectService.UpdateProjectAsync(id, dto, userId));
    }

    /// <summary>Delete a project (does NOT delete the media files themselves).</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();
        await _projectService.DeleteProjectAsync(id, userId);
        return NoContent();
    }

    /// <summary>Add media items to a project.</summary>
    [HttpPost("{id}/media")]
    public async Task<IActionResult> AddMedia(Guid id, [FromBody] AddMediaToProjectDTO dto)
    {
        var userId = GetUserId();
        return Ok(await _projectService.AddMediaAsync(id, dto, userId));
    }

    /// <summary>Remove media items from a project.</summary>
    [HttpDelete("{id}/media")]
    public async Task<IActionResult> RemoveMedia(Guid id, [FromBody] RemoveMediaFromProjectDTO dto)
    {
        var userId = GetUserId();
        return Ok(await _projectService.RemoveMediaAsync(id, dto, userId));
    }

    /// <summary>Reorder media inside a project.</summary>
    [HttpPut("{id}/media/reorder")]
    public async Task<IActionResult> ReorderMedia(Guid id, [FromBody] ReorderProjectMediaDTO dto)
    {
        var userId = GetUserId();
        return Ok(await _projectService.ReorderMediaAsync(id, dto, userId));
    }
}
