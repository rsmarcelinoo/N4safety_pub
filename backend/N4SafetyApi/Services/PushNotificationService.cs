using System.Text;
using System.Text.Json;

namespace N4SafetyApi.Services;

/// <summary>
/// Sends push notifications via the Expo push API.
/// Expo handles routing to APNs (iOS) and FCM (Android) transparently.
/// Token format: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
/// </summary>
public class PushNotificationService
{
    private readonly IHttpClientFactory _http;
    private readonly string             _pushUrl;

    public PushNotificationService(IHttpClientFactory http, IConfiguration config)
    {
        _http    = http;
        _pushUrl = config["Expo:PushUrl"] ?? "https://exp.host/--/api/v2/push/send";
    }

    public async Task SendSosAlert(
        IEnumerable<string> pushTokens,
        string              ownerName,
        Guid                eventId)
    {
        var messages = pushTokens.Select(token => new
        {
            to      = token,
            sound   = "default",
            title   = "🚨 SOS Alert",
            body    = $"{ownerName} needs help right now.",
            data    = new { type = "sos_alert", eventId = eventId.ToString() },
            priority = "high",
        }).ToList();

        if (!messages.Any()) return;

        await Post(messages);
    }

    public async Task SendSosCancelled(
        IEnumerable<string> pushTokens,
        string              ownerName)
    {
        var messages = pushTokens.Select(token => new
        {
            to    = token,
            title = "✅ SOS Cancelled",
            body  = $"{ownerName}'s SOS alert has been cancelled.",
            data  = new { type = "sos_cancelled" },
        }).ToList();

        if (!messages.Any()) return;

        await Post(messages);
    }

    private async Task Post(object payload)
    {
        var client  = _http.CreateClient();
        var json    = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        // Expo recommends batching — we send up to 100 at once (their limit)
        var response = await client.PostAsync(_pushUrl, content);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            Console.Error.WriteLine($"[Push] Expo API error {response.StatusCode}: {body}");
        }
    }
}
