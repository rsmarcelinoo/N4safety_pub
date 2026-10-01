using Twilio;
using Twilio.Rest.Api.V2010.Account;

namespace N4SafetyApi.Services;

/// <summary>
/// Sends SMS via Twilio to circle members who don't have the N4Safety app.
/// Template confirmed by Rodrigo: "Your friend/family member {name} is in danger. Click here to view their location."
/// </summary>
public class SmsService
{
    private readonly string _fromNumber;
    private readonly string _baseUrl;
    private readonly bool   _enabled;

    public SmsService(IConfiguration config)
    {
        var sid     = config["Twilio:AccountSid"] ?? "";
        var token   = config["Twilio:AuthToken"]  ?? "";
        _fromNumber = config["Twilio:FromNumber"] ?? "";
        _baseUrl    = config["App:BaseUrl"]        ?? "https://n4safety.app";
        _enabled    = !string.IsNullOrEmpty(sid) && !string.IsNullOrEmpty(token);

        if (_enabled) TwilioClient.Init(sid, token);
    }

    public async Task SendSosAlert(string toPhone, string ownerName, Guid eventId)
    {
        if (!_enabled)
        {
            Console.WriteLine($"[SMS] Would send to {toPhone}: SOS from {ownerName} (event {eventId}) — Twilio not configured.");
            return;
        }

        var locationUrl = $"{_baseUrl}/sos/{eventId}";
        var body = $"Your friend/family member {ownerName} is in danger. " +
                   $"Click here to view their location: {locationUrl}";

        await MessageResource.CreateAsync(
            to:   new Twilio.Types.PhoneNumber(toPhone),
            from: new Twilio.Types.PhoneNumber(_fromNumber),
            body: body);
    }

    public async Task SendBulk(IEnumerable<(string Phone, string OwnerName)> targets, Guid eventId)
    {
        var tasks = targets.Select(t => SendSosAlert(t.Phone, t.OwnerName, eventId));
        await Task.WhenAll(tasks);
    }
}
