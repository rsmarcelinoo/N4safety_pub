using System.Data;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using N4SafetyApi.Data;
using N4SafetyApi.Middleware;
using N4SafetyApi.Models;

namespace N4SafetyApi.Controllers;

[ApiController]
[Route("api/v1/circles")]
[Authorize]
public class CirclesController : ControllerBase
{
    private readonly Database _db;

    public CirclesController(Database db)
    {
        _db = db;
    }

    private static CircleDto MapCircle(dynamic r) => new(
        Id: r.id, Name: r.name, IsActive: r.is_active,
        AlertSos: r.alert_sos, AlertNotification: r.alert_notification,
        AlertEmergencyServices: r.alert_emergency_services, CreatedAt: r.created_at);

    private static CircleMemberDto MapMember(dynamic r) => new(
        Name: r.name, Phone: r.phone, UserId: r.user_id);

    private async Task<CircleDto?> GetCircleWithMembers(IDbConnection conn, Guid circleId)
    {
        var row = await conn.QuerySingleOrDefaultAsync(@"
            SELECT id, name, is_active, alert_sos, alert_notification,
                   alert_emergency_services, created_at
            FROM circles WHERE id = @CircleId",
            new { CircleId = circleId });

        if (row == null) return null;
        CircleDto circle = MapCircle(row);

        var members = new List<CircleMemberDto>();
        foreach (var m in await conn.QueryAsync(@"
            SELECT name, phone, user_id FROM circle_members
            WHERE circle_id = @CircleId ORDER BY id ASC",
            new { CircleId = circleId }))
            members.Add(MapMember(m));

        return circle with { Members = members };
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var circles = new List<CircleDto>();
        foreach (var r in await conn.QueryAsync(@"
            SELECT id, name, is_active, alert_sos, alert_notification,
                   alert_emergency_services, created_at
            FROM circles WHERE owner_id = @UserId ORDER BY created_at DESC",
            new { UserId = userId }))
            circles.Add(MapCircle(r));

        if (circles.Count > 0)
        {
            var circleIds = circles.Select(c => c.Id).ToList();
            var memberRows = await conn.QueryAsync(@"
                SELECT circle_id, name, phone, user_id
                FROM circle_members WHERE circle_id = ANY(@CircleIds)
                ORDER BY id ASC",
                new { CircleIds = circleIds });

            var lookup = new Dictionary<Guid, List<CircleMemberDto>>();
            foreach (var r in memberRows)
            {
                var cid = (Guid)r.circle_id;
                if (!lookup.ContainsKey(cid)) lookup[cid] = new List<CircleMemberDto>();
                lookup[cid].Add(MapMember(r));
            }

            for (int i = 0; i < circles.Count; i++)
                if (lookup.TryGetValue(circles[i].Id, out var ms))
                    circles[i] = circles[i] with { Members = ms };
        }

        return Ok(circles);
    }

    /// <summary>POST /api/v1/circles — create a new circle with members</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCircleRequest req)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;
        using var tx = await conn.BeginTransactionAsync();

        // Insert circle
        var circleId = await conn.QuerySingleAsync<Guid>(@"
            INSERT INTO circles (owner_id, name, is_active, alert_sos, alert_notification, alert_emergency_services)
            VALUES (@OwnerId, @Name, @IsActive, @AlertSos, @AlertNotification, @AlertEmergencyServices)
            RETURNING id",
            new
            {
                OwnerId = userId,
                req.Name,
                req.IsActive,
                req.AlertSos,
                req.AlertNotification,
                req.AlertEmergencyServices
            }, tx);

        // Insert members
        if (req.Members != null && req.Members.Count > 0)
        {
            foreach (var member in req.Members)
            {
                // Look up user by phone if exists
                var memberUserId = await conn.QuerySingleOrDefaultAsync<Guid?>(@"
                    SELECT id FROM users WHERE phone = @Phone LIMIT 1",
                    new { member.Phone }, tx);

                await conn.ExecuteAsync(@"
                    INSERT INTO circle_members (circle_id, user_id, name, phone)
                    VALUES (@CircleId, @UserId, @Name, @Phone)",
                    new
                    {
                        CircleId = circleId,
                        UserId = memberUserId,
                        member.Name,
                        member.Phone
                    }, tx);
            }
        }

        await tx.CommitAsync();

        // Return created circle using helper
        var result = await GetCircleWithMembers(conn, circleId);

        return CreatedAtAction(nameof(Create), new { id = circleId }, result);
    }

    /// <summary>PUT /api/v1/circles/{id} — update a circle and its members</summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCircleRequest req)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;
        using var tx = await conn.BeginTransactionAsync();

        // Verify ownership
        var owner = await conn.QuerySingleOrDefaultAsync<Guid?>(@"
            SELECT owner_id FROM circles WHERE id = @Id",
            new { Id = id }, tx);

        if (owner != userId)
            return Unauthorized(new { error = "Not the circle owner." });

        // Update circle
        await conn.ExecuteAsync(@"
            UPDATE circles
            SET name = @Name,
                is_active = @IsActive,
                alert_sos = @AlertSos,
                alert_notification = @AlertNotification,
                alert_emergency_services = @AlertEmergencyServices,
                updated_at = now()
            WHERE id = @Id",
            new
            {
                Id = id,
                req.Name,
                req.IsActive,
                req.AlertSos,
                req.AlertNotification,
                req.AlertEmergencyServices
            }, tx);

        // Delete all existing members
        await conn.ExecuteAsync(@"
            DELETE FROM circle_members WHERE circle_id = @CircleId",
            new { CircleId = id }, tx);

        // Re-insert members
        foreach (var member in req.Members)
        {
            var memberUserId = await conn.QuerySingleOrDefaultAsync<Guid?>(@"
                SELECT id FROM users WHERE phone = @Phone LIMIT 1",
                new { member.Phone }, tx);

            await conn.ExecuteAsync(@"
                INSERT INTO circle_members (circle_id, user_id, name, phone)
                VALUES (@CircleId, @UserId, @Name, @Phone)",
                new
                {
                    CircleId = id,
                    UserId = memberUserId,
                    member.Name,
                    member.Phone
                }, tx);
        }

        await tx.CommitAsync();

        // Return updated circle using helper
        var result = await GetCircleWithMembers(conn, id);

        return Ok(result);
    }

    /// <summary>DELETE /api/v1/circles/{id} — delete a circle</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var rows = await conn.ExecuteAsync(@"
            DELETE FROM circles
            WHERE id = @Id AND owner_id = @UserId",
            new { Id = id, UserId = userId });

        if (rows == 0)
            return NotFound(new { error = "Circle not found or not owner." });

        return NoContent();
    }

    /// <summary>PATCH /api/v1/circles/{id}/toggle — toggle circle's active status</summary>
    [HttpPatch("{id}/toggle")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var rows = await conn.ExecuteAsync(@"
            UPDATE circles
            SET is_active = NOT is_active, updated_at = now()
            WHERE id = @Id AND owner_id = @UserId",
            new { Id = id, UserId = userId });

        if (rows == 0)
            return NotFound(new { error = "Circle not found or not owner." });

        // Return updated circle using helper
        var result = await GetCircleWithMembers(conn, id);

        return Ok(result);
    }

    /// <summary>GET /api/v1/circles/memberships — returns circles user is a member of</summary>
    [HttpGet("memberships")]
    public async Task<IActionResult> Memberships()
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var memberships = await conn.QueryAsync<CircleMembershipDto>(@"
            SELECT
                circle_id AS CircleId,
                circle_name AS CircleName,
                owner_name AS OwnerName,
                owner_id AS OwnerId,
                is_active AS IsActive,
                alert_sos AS AlertSos,
                alert_notification AS AlertNotification,
                alert_emergency_services AS AlertEmergencyServices,
                added_at AS AddedAt
            FROM v_circle_memberships
            WHERE member_user_id = @UserId
            ORDER BY added_at DESC",
            new { UserId = userId });

        return Ok(memberships);
    }
}
