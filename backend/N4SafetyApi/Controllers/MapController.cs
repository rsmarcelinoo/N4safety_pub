using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using N4SafetyApi.Data;
using N4SafetyApi.Middleware;
using N4SafetyApi.Models;

namespace N4SafetyApi.Controllers;

[ApiController]
[Route("api/v1/map")]
public class MapController : ControllerBase
{
    private readonly Database _db;

    public MapController(Database db) => _db = db;

    /// <summary>
    /// GET /api/v1/map/danger-zones?bbox=minLng,minLat,maxLng,maxLat
    /// Returns a GeoJSON FeatureCollection of danger zones intersecting the bbox.
    /// No auth required — public read.
    /// </summary>
    [HttpGet("danger-zones")]
    public async Task<IActionResult> DangerZones([FromQuery] string? bbox)
    {
        double minLng = -9.5, minLat = 38.5, maxLng = -6.0, maxLat = 42.5; // Portugal default

        if (!string.IsNullOrEmpty(bbox))
        {
            var parts = bbox.Split(',');
            if (parts.Length == 4 &&
                double.TryParse(parts[0], out var a) &&
                double.TryParse(parts[1], out var b) &&
                double.TryParse(parts[2], out var c) &&
                double.TryParse(parts[3], out var d))
            {
                minLng = a; minLat = b; maxLng = c; maxLat = d;
            }
        }

        using var conn = _db.CreateConnection();
        await conn.OpenAsync();

        var features = new List<DangerZoneFeature>();
        foreach (var r in await conn.QueryAsync(@"
            SELECT id, label, risk_level, geojson
            FROM fn_danger_zones_in_bbox(@MinLng, @MinLat, @MaxLng, @MaxLat)",
            new { MinLng = minLng, MinLat = minLat, MaxLng = maxLng, MaxLat = maxLat }))
        {
            features.Add(new DangerZoneFeature(
                Type: "Feature",
                Geometry: JsonSerializer.Deserialize<object>((string)r.geojson)!,
                Properties: new DangerZoneProperties(
                    (Guid)r.id, (string)r.label, (string)r.risk_level)
            ));
        }

        return Ok(new DangerZoneCollection("FeatureCollection", features));
    }

    /// <summary>
    /// GET /api/v1/map/heatmap?bbox=minLng,minLat,maxLng,maxLat
    /// Returns a GeoJSON FeatureCollection of weighted incident points for the
    /// MapLibre heatmap layer. Each feature has properties.weight (0.0–1.0).
    /// No auth required — public read.
    /// </summary>
    [HttpGet("heatmap")]
    public async Task<IActionResult> Heatmap([FromQuery] string? bbox)
    {
        double minLng = -9.5, minLat = 38.5, maxLng = -6.0, maxLat = 42.5;

        if (!string.IsNullOrEmpty(bbox))
        {
            var parts = bbox.Split(',');
            if (parts.Length == 4 &&
                double.TryParse(parts[0], System.Globalization.CultureInfo.InvariantCulture, out var a) &&
                double.TryParse(parts[1], System.Globalization.CultureInfo.InvariantCulture, out var b) &&
                double.TryParse(parts[2], System.Globalization.CultureInfo.InvariantCulture, out var c) &&
                double.TryParse(parts[3], System.Globalization.CultureInfo.InvariantCulture, out var d))
            {
                minLng = a; minLat = b; maxLng = c; maxLat = d;
            }
        }

        using var conn = _db.CreateConnection();
        await conn.OpenAsync();

        var points = await conn.QueryAsync<HeatmapPoint>(
            "SELECT lat AS Lat, lng AS Lng, weight AS Weight FROM fn_heatmap_points_in_bbox(@MinLng, @MinLat, @MaxLng, @MaxLat)",
            new { MinLng = minLng, MinLat = minLat, MaxLng = maxLng, MaxLat = maxLat });

        // Serialise as GeoJSON FeatureCollection manually for a compact, spec-compliant output
        var features = points.Select(p => new
        {
            type = "Feature",
            geometry = new { type = "Point", coordinates = new[] { p.Lng, p.Lat } },
            properties = new { weight = Math.Round(p.Weight, 4) },
        });

        return Ok(new { type = "FeatureCollection", features });
    }

    /// <summary>
    /// GET /api/v1/map/area-summary?lat=39.7436&amp;lng=-8.8071&amp;radius=500
    /// Returns a risk summary for a circular area. No auth required — public read.
    /// </summary>
    [HttpGet("area-summary")]
    public async Task<IActionResult> AreaSummary(
        [FromQuery] double lat,
        [FromQuery] double lng,
        [FromQuery] int radius = 500)
    {
        using var conn = _db.CreateConnection();
        await conn.OpenAsync();

        // Total reports by type (excluding safe_checkin and sos_trigger)
        var breakdown = (await conn.QueryAsync<(string Type, int Count)>(@"
            SELECT type::text AS Type, COUNT(*)::int AS Count
            FROM incident_reports
            WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326)::geography, @Radius)
              AND reported_at > now() - INTERVAL '1 year'
              AND type NOT IN ('safe_checkin', 'sos_trigger')
            GROUP BY type
            ORDER BY Count DESC",
            new { Lng = lng, Lat = lat, Radius = radius }))
            .ToList();

        var totalReports = breakdown.Sum(b => b.Count);
        var topType = breakdown.FirstOrDefault().Type;
        var breakdownDict = breakdown.ToDictionary(b => b.Type, b => b.Count);

        // Recent 24h
        var recent24h = await conn.QuerySingleAsync<int>(@"
            SELECT COUNT(*)::int
            FROM incident_reports
            WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326)::geography, @Radius)
              AND reported_at > now() - INTERVAL '24 hours'",
            new { Lng = lng, Lat = lat, Radius = radius });

        // Riskiest/safest hour by summed base_points
        var hourPoints = (await conn.QueryAsync<(int Hour, long Points)>(@"
            SELECT EXTRACT(HOUR FROM reported_at AT TIME ZONE 'Europe/Lisbon')::int AS Hour,
                   SUM(base_points)::bigint AS Points
            FROM incident_reports
            WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326)::geography, @Radius)
              AND reported_at > now() - INTERVAL '90 days'
              AND type NOT IN ('safe_checkin')
            GROUP BY Hour
            ORDER BY Points DESC",
            new { Lng = lng, Lat = lat, Radius = radius }))
            .ToList();

        var riskiestHour = hourPoints.FirstOrDefault().Hour;
        var safestHour = hourPoints.LastOrDefault().Hour;
        var riskScore = Math.Min(1.0, totalReports / 20.0);

        return Ok(new AreaSummaryDto(
            TotalReports: totalReports,
            Recent24h: recent24h,
            TopType: topType,
            RiskScore: Math.Round(riskScore, 2),
            RiskiestHour: riskiestHour > 0 ? riskiestHour : null,
            SafestHour: safestHour > 0 ? safestHour : null,
            Breakdown: breakdownDict
        ));
    }

    /// <summary>
    /// POST /api/v1/map/safe-checkin
    /// Marks the user as safe at a location and inserts a negative-weight
    /// point that dampens local heatmap intensity.
    /// </summary>
    [Authorize]
    [HttpPost("safe-checkin")]
    public async Task<IActionResult> SafeCheckin([FromBody] SafeCheckinRequest req)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        await conn.ExecuteAsync(@"
            INSERT INTO incident_reports (user_id, type, base_points, lat, lng, geom)
            VALUES (
                @UserId,
                'safe_checkin'::incident_type,
                -8,
                @Lat,
                @Lng,
                ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326)
            )",
            new { UserId = userId, req.Lat, req.Lng });

        await conn.QuerySingleAsync<decimal>(
            "SELECT fn_adjust_user_credibility(@UserId)",
            new { UserId = userId });

        return StatusCode(StatusCodes.Status201Created, new
        {
            lat = req.Lat,
            lng = req.Lng,
            checkedInAt = DateTime.UtcNow,
        });
    }
}
