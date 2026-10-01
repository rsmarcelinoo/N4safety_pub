using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using N4SafetyApi.Data;

namespace N4SafetyApi.Hubs;

/// <summary>
/// Real-time SOS hub. Circle members connect here to receive live GPS
/// of the distressed user while a SOS event is active.
///
/// Mobile connects via:
///   new HubConnectionBuilder()
///     .withUrl(`${BASE}/hubs/sos?access_token=${token}`)
///     .withAutomaticReconnect()
///     .build();
///
/// Events:
///   Client → Server: StreamLocation(eventId, lat, lng)
///   Server → Client: ReceiveLocation(eventId, lat, lng, timestamp)
///   Server → Client: SOSTriggered(eventId, ownerName, lat, lng)
///   Server → Client: SOSCancelled(eventId)
/// </summary>
[Authorize]
public class SOSHub : Hub
{
    private readonly Database _db;

    public SOSHub(Database db) => _db = db;

    /// <summary>
    /// Called every 5s by the SOS sender's phone to stream live GPS.
    /// Stores the point in sos_location_stream and broadcasts to circle members.
    /// </summary>
    public async Task StreamLocation(Guid eventId, double lat, double lng)
    {
        var userId = GetUserId();

        using var conn = _db.CreateConnection();
        await conn.OpenAsync();

        // Verify caller owns this event
        var owned = await conn.QuerySingleOrDefaultAsync<bool>(@"
            SELECT EXISTS(
                SELECT 1 FROM sos_events WHERE id = @EventId AND user_id = @UserId AND cancelled_at IS NULL
            )", new { EventId = eventId, UserId = userId });

        if (!owned) return;

        // Persist the location point
        await conn.ExecuteAsync(@"
            INSERT INTO sos_location_stream (event_id, geom)
            VALUES (@EventId, ST_SetSRID(ST_MakePoint(@Lng, @Lat), 4326))",
            new { EventId = eventId, Lat = lat, Lng = lng });

        // Broadcast to everyone in the event's circle group
        await Clients.Group($"sos-{eventId}")
            .SendAsync("ReceiveLocation", eventId, lat, lng, DateTime.UtcNow);
    }

    /// <summary>
    /// Joining the hub group for a specific SOS event.
    /// Circle members join via their connected push token registration.
    /// Called automatically by the mobile app when viewing a live SOS.
    /// </summary>
    public async Task JoinSOSEvent(Guid eventId)
    {
        var userId = GetUserId();

        using var conn = _db.CreateConnection();
        await conn.OpenAsync();

        // Verify this user is a member of a circle alerted in this event
        var isMember = await conn.QuerySingleOrDefaultAsync<bool>(@"
            SELECT EXISTS(
                SELECT 1
                FROM sos_events e
                JOIN circles c ON c.id = ANY(e.circle_ids)
                JOIN circle_members cm ON cm.circle_id = c.id
                WHERE e.id = @EventId AND cm.user_id = @UserId
            )", new { EventId = eventId, UserId = userId });

        if (!isMember) return;

        await Groups.AddToGroupAsync(Context.ConnectionId, $"sos-{eventId}");
    }

    private Guid GetUserId()
    {
        var sub = Context.User?.FindFirstValue(JwtRegisteredClaimNames.Sub)
               ?? Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (sub is null || !Guid.TryParse(sub, out var id))
            throw new HubException("Unauthenticated.");
        return id;
    }
}
