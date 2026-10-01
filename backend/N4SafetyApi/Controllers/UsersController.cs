using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using N4SafetyApi.Data;
using N4SafetyApi.Middleware;
using N4SafetyApi.Models;

namespace N4SafetyApi.Controllers;

[ApiController]
[Route("api/v1/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly Database _db;

    public UsersController(Database db)
    {
        _db = db;
    }

    /// <summary>GET /api/v1/users/me — returns current user's profile</summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var user = await conn.QuerySingleOrDefaultAsync<UserDto>(@"
            SELECT id, email, name, phone, avatar_url AS AvatarUrl, age
            FROM users
            WHERE id = @UserId",
            new { UserId = userId });

        if (user is null)
            return NotFound(new { error = "User not found." });

        return Ok(user);
    }

    /// <summary>PATCH /api/v1/users/me — update current user's profile</summary>
    [HttpPatch("me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateUserRequest req)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        await conn.ExecuteAsync(@"
            UPDATE users
            SET name = COALESCE(@Name, name),
                phone = COALESCE(@Phone, phone),
                age = COALESCE(@Age, age),
                avatar_url = COALESCE(@AvatarUrl, avatar_url),
                updated_at = now()
            WHERE id = @UserId",
            new { UserId = userId, req.Name, req.Phone, req.Age, req.AvatarUrl });

        // Return updated user
        var user = await conn.QuerySingleAsync<UserDto>(@"
            SELECT id, email, name, phone, avatar_url AS AvatarUrl, age
            FROM users
            WHERE id = @UserId",
            new { UserId = userId });

        return Ok(user);
    }

    /// <summary>POST /api/v1/users/me/push-token — register push notification token</summary>
    [HttpPost("me/push-token")]
    public async Task<IActionResult> RegisterPushToken([FromBody] PushTokenRequest req)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        await conn.ExecuteAsync(@"
            INSERT INTO push_tokens (user_id, token, platform, updated_at)
            VALUES (@UserId, @Token, @Platform, now())
            ON CONFLICT (token) DO UPDATE
            SET updated_at = now(), platform = EXCLUDED.platform",
            new { UserId = userId, req.Token, req.Platform });

        return NoContent();
    }
}
