using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using N4SafetyApi.Data;
using N4SafetyApi.Middleware;
using N4SafetyApi.Models;

namespace N4SafetyApi.Controllers;

[ApiController]
[Route("api/v1/locations")]
[Authorize]
public class LocationsController : ControllerBase
{
    private readonly Database _db;

    public LocationsController(Database db)
    {
        _db = db;
    }

    /// <summary>GET /api/v1/locations — returns user's saved locations</summary>
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var locations = await conn.QueryAsync<SavedLocationDto>(@"
            SELECT
                id,
                name,
                address,
                lat,
                lng,
                added_at AS AddedAt
            FROM saved_locations
            WHERE user_id = @UserId
            ORDER BY added_at DESC",
            new { UserId = userId });

        return Ok(locations);
    }

    /// <summary>POST /api/v1/locations — create a new saved location</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateLocationRequest req)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var location = await conn.QuerySingleAsync<SavedLocationDto>(@"
            INSERT INTO saved_locations (user_id, name, address, geom)
            VALUES (@UserId, @Name, @Address, ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326))
            RETURNING id, name, address, lat, lng, added_at AS AddedAt",
            new { UserId = userId, req.Name, req.Address, req.Lat, req.Lng });

        return CreatedAtAction(nameof(Create), new { id = location.Id }, location);
    }

    /// <summary>DELETE /api/v1/locations/{id} — delete a saved location</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var rows = await conn.ExecuteAsync(@"
            DELETE FROM saved_locations
            WHERE id = @Id AND user_id = @UserId",
            new { Id = id, UserId = userId });

        if (rows == 0)
            return NotFound(new { error = "Location not found or not owner." });

        return NoContent();
    }
}
