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

    [HttpPost("url")]
    public IActionResult GetPresignedUrl([FromBody] PresignRequest input) => Ok(new { url = _uploadService.GetPresignedUrl(input.FileName) }); //+ new FileName

    [HttpPost("complete")]
    public async Task<IActionResult> UploadComplete([FromBody] MediaUploadCompleteDTO input) //need to sync it with FE, because the endpoint was synchronous before (not async Task)
        => Ok(await _uploadService.UploadCompleteAsync(input));

    [HttpGet("media/{id}/url")]
    public async Task<IActionResult> GetMediaUrl(string mediaId)
    {
        return Ok(await _uploadService.GetMediaURLAsync(mediaId));
    }

    [HttpGet("media")]
    public async Task<IActionResult> GetMedia() // this must be moven to media controller, also the result wasn't containing thumbnail url and video url
        => Ok(await _mediaService.GetAllMediaAsync());

}
