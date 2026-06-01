using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using VimeoCopyAPI.Services.Interfaces;

namespace VimeoCopyAPI.Controllers;


[ApiController]
[Route("api/users")]
public class UserController : ControllerBase
{
    private readonly IUserService _userService;

    public UserController(IUserService userService)
    {
        _userService = userService;
    }

    // Requires auth and only returns the caller's own data — this DTO holds email,
    // storage/bandwidth and the full (incl. private) media list.
    [Authorize]
    [HttpGet("/getData/{userId}")]
    public async Task<IActionResult> GetUserData(string userId)
    {
        var callerId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(callerId) || callerId != userId)
            return Forbid();

        return Ok(await _userService.GetUserDataAsync(userId));
    }
}
