using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using N4SafetyApi.Data;
using N4SafetyApi.Middleware;
using N4SafetyApi.Models;

namespace N4SafetyApi.Controllers;

[ApiController]
[Route("api/v1/map/reports")]
[Authorize]
public class ReportsController : ControllerBase
{
    // Base risk points per incident type — set at insert time so future
    // rebalancing does not retroactively alter historical report weights.
    private static readonly Dictionary<string, short> BasePoints = new()
    {
        ["poor_lighting"]    = 15,
        ["suspicious_person"] = 25,
        ["harassment"]       = 55,
        ["theft"]            = 65,
        ["fight"]            = 70,
        ["assault"]          = 90,
        ["sos_trigger"]      = 150,   // internal — not submittable via this endpoint
    };

    private readonly Database _db;

    public ReportsController(Database db) => _db = db;

    /// <summary>POST /api/v1/map/reports — submit a crowd-sourced incident report</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReportRequest req)
    {
        var userId = HttpContext.UserId();

        if (!BasePoints.TryGetValue(req.Type, out var points))
            return BadRequest(new { error = $"Unknown incident type: {req.Type}" });

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var id = await conn.QuerySingleAsync<Guid>(@"
            INSERT INTO incident_reports (user_id, type, base_points, lat, lng, geom)
            VALUES (
                @UserId,
                @Type::incident_type,
                @Points,
                @Lat,
                @Lng,
                ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326)
            )
            RETURNING id",
            new { UserId = userId, Type = req.Type, Points = points, req.Lat, req.Lng });

        // Upsert user credibility row — creates on first report, increments count
        await conn.ExecuteAsync(@"
            INSERT INTO user_credibility (user_id, report_count, updated_at)
            VALUES (@UserId, 1, now())
            ON CONFLICT (user_id) DO UPDATE
            SET report_count = user_credibility.report_count + 1,
                updated_at   = now()",
            new { UserId = userId });

        return CreatedAtAction(nameof(Create), new { id },
            new ReportDto(id, req.Type, req.Lat, req.Lng, DateTime.UtcNow));
    }
}
