using Microsoft.AspNetCore.Mvc;
using VimeoCopyAPI.Models;
using VimeoCopyAPI.Models.DTOs;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UploadController : ControllerBase
{
    private readonly IUploadService _uploadService;
    private readonly IMediaService _mediaService;

    public UploadController(IUploadService uploadService, IMediaService mediaService)
    {
        _uploadService = uploadService;
        _mediaService = mediaService;
    }

    [HttpGet("url")]
    public IActionResult GetPresignedUrl()
        => Ok(_uploadService.GetPresignedUrl());

    [HttpPost("complete")]
    public async Task<IActionResult> UploadComplete([FromBody] MediaUploadCompleteDTO input)
        => Ok(await _uploadService.UploadCompleteAsync(input));

    [HttpGet("media/{id}/url")]
    public async Task<IActionResult> GetMediaUrl(string mediaId)
    {
        return Ok(await _uploadService.GetMediaURLAsync(mediaId));
    }

    [HttpGet("media")]
    public async Task<IActionResult> GetMedia()
        => Ok(await _mediaService.GetAllMediaAsync());
}
