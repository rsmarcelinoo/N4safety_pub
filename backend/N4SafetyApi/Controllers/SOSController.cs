using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using N4SafetyApi.Data;
using N4SafetyApi.Hubs;
using N4SafetyApi.Middleware;
using N4SafetyApi.Models;
using N4SafetyApi.Services;

namespace N4SafetyApi.Controllers;

[ApiController]
[Route("api/v1/sos")]
[Authorize]
public class SOSController : ControllerBase
{
    private readonly Database                   _db;
    private readonly PushNotificationService    _push;
    private readonly SmsService                 _sms;
    private readonly IHubContext<SOSHub>        _hub;

    public SOSController(
        Database db,
        PushNotificationService push,
        SmsService sms,
        IHubContext<SOSHub> hub)
    {
        _db   = db;
        _push = push;
        _sms  = sms;
        _hub  = hub;
    }

    /// <summary>POST /api/v1/sos/trigger — fire an SOS alert</summary>
    [HttpPost("trigger")]
    public async Task<IActionResult> Trigger([FromBody] TriggerSosRequest req)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;
        using var tx   = await conn.BeginTransactionAsync();

        // Insert the SOS event row
        var geomSql = (req.Lat.HasValue && req.Lng.HasValue)
            ? "ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326)"
            : "NULL";

        var eventId = await conn.QuerySingleAsync<Guid>($@"
            INSERT INTO sos_events (user_id, geom, circle_ids)
            VALUES (@UserId, {geomSql}, @CircleIds)
            RETURNING id",
            new { UserId = userId, req.Lat, req.Lng, CircleIds = req.CircleIds }, tx);

        // Get the owner's name for notification messages
        var ownerName = await conn.QuerySingleAsync<string>(
            "SELECT name FROM users WHERE id = @Id", new { Id = userId }, tx);

        await tx.CommitAsync();

        // Dispatch in background — don't hold the HTTP response
        _ = Task.Run(async () =>
        {
            using var bgConn = _db.CreateConnection();
            await bgConn.OpenAsync();

            // Auto-insert a sos_trigger incident report so the heatmap reflects this event
            if (req.Lat.HasValue && req.Lng.HasValue)
            {
                try
                {
                    // Set RLS scope for this connection before inserting
                    await bgConn.ExecuteAsync(
                        "SELECT set_config('app.current_user_id', @uid, false)",
                        new { uid = userId.ToString() });

                    await bgConn.ExecuteAsync(@"
                        INSERT INTO incident_reports (user_id, type, base_points, lat, lng, geom)
                        VALUES (
                            @UserId,
                            'sos_trigger'::incident_type,
                            150,
                            @Lat,
                            @Lng,
                            ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326)
                        )
                        ON CONFLICT DO NOTHING",
                        new { UserId = userId, Lat = req.Lat.Value, Lng = req.Lng.Value });
                }
                catch { /* non-critical — SOS dispatch continues regardless */ }
            }

            // Push to registered app users
            var pushRecipients = await bgConn.QueryAsync<SosRecipientRow>(
                "SELECT * FROM fn_get_active_sos_recipients(@EventId)", new { EventId = eventId });

            var pushTokens = await bgConn.QueryAsync<string>(@"
                SELECT token FROM push_tokens
                WHERE user_id = ANY(@UserIds)",
                new { UserIds = pushRecipients.Select(r => r.UserId).ToArray() });

            await _push.SendSosAlert(pushTokens, ownerName, eventId);

            // SMS to non-app contacts
            var smsRecipients = await bgConn.QueryAsync<SmsRecipientRow>(
                "SELECT * FROM fn_get_sms_recipients(@EventId)", new { EventId = eventId });

            await _sms.SendBulk(smsRecipients.Select(r => (r.Phone, r.OwnerName)), eventId);

            // Notify only circle members — never broadcast to all connected users
            var recipientIds = pushRecipients.Select(r => r.UserId.ToString()).ToList();
            await _hub.Clients.Users(recipientIds).SendAsync("SOSTriggered", eventId, ownerName, req.Lat, req.Lng);
        });

        return CreatedAtAction(nameof(Trigger), new { id = eventId },
            new { eventId, triggeredAt = DateTime.UtcNow });
    }

    /// <summary>POST /api/v1/sos/{id}/cancel — cancel an active SOS</summary>
    [HttpPost("{id}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var rows = await conn.ExecuteAsync(@"
            UPDATE sos_events
            SET cancelled_at = now()
            WHERE id = @Id AND user_id = @UserId AND cancelled_at IS NULL",
            new { Id = id, UserId = userId });

        if (rows == 0)
            return NotFound(new { error = "Event not found or already cancelled." });

        var ownerName = await conn.QuerySingleAsync<string>(
            "SELECT name FROM users WHERE id = @Id", new { Id = userId });

        _ = Task.Run(() =>
            _hub.Clients.Group($"sos-{id}").SendAsync("SOSCancelled", id));

        _ = Task.Run(async () =>
        {
            using var bgConn = _db.CreateConnection();
            await bgConn.OpenAsync();

            var pushRecipients = await bgConn.QueryAsync<SosRecipientRow>(
                "SELECT * FROM fn_get_active_sos_recipients(@EventId)", new { EventId = id });

            var pushTokens = await bgConn.QueryAsync<string>(@"
                SELECT token FROM push_tokens WHERE user_id = ANY(@UserIds)",
                new { UserIds = pushRecipients.Select(r => r.UserId).ToArray() });

            await _push.SendSosCancelled(pushTokens, ownerName);
        });

        return NoContent();
    }

    /// <summary>GET /api/v1/sos/history — returns this user's SOS history</summary>
    [HttpGet("history")]
    public async Task<IActionResult> History()
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var events = await conn.QueryAsync<SosEventDto>(@"
            SELECT
                id,
                user_id      AS UserId,
                triggered_at AS TriggeredAt,
                cancelled_at AS CancelledAt,
                lat,
                lng,
                circle_ids   AS CircleIds
            FROM sos_events
            WHERE user_id = @UserId
            ORDER BY triggered_at DESC
            LIMIT 50",
            new { UserId = userId });

        return Ok(events);
    }

    /// <summary>GET /api/v1/sos/{id}/location — latest GPS point for an active event</summary>
    [HttpGet("{id}/location")]
    public async Task<IActionResult> LatestLocation(Guid id)
    {
        var userId = HttpContext.UserId();

        await using var scope = await _db.OpenForUser(userId);
        var conn = scope.Conn;

        var row = await conn.QuerySingleOrDefaultAsync<SosLocationRow>(@"
            SELECT event_id, lat, lng, recorded_at
            FROM v_sos_latest_location
            WHERE event_id = @EventId",
            new { EventId = id });

        if (row is null) return NotFound();
        return Ok(row);
    }
}
