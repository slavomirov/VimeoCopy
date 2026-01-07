using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VimeoCopyApi.Data;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;

[ApiController]
[Route("api/media")]
public class MediaController : ControllerBase
{
    private readonly IMediaService _mediaService;

    public MediaController(IMediaService mediaService)
    {
        _mediaService = mediaService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _mediaService.GetAllMediaAsync());

    [HttpGet("{id}/url")]
    public async Task<IActionResult> GetPresignedGetUrl(Guid mediaId) => Ok(await _mediaService.GetPresignedURLAsync(mediaId)); 

}
