using Microsoft.AspNetCore.Mvc;
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

    [HttpGet("/getData/{userId}")]
    public async Task<IActionResult> GetUserData(string userId) => Ok(await _userService.GetUserDataAsync(userId)); //po-skoro s username, da e po-gotino v url-a
}
