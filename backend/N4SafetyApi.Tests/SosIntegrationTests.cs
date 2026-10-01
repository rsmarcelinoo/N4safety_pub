using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Xunit;

namespace N4SafetyApi.Tests;

/// <summary>
/// Integration tests for SOS endpoints:
/// - POST /api/v1/sos/trigger (requires authentication)
/// </summary>
public class SosIntegrationTests : IntegrationTestBase
{
    /// <summary>
    /// Helper method: Create a test user and return their access token
    /// </summary>
    private async Task<string> CreateTestUserAndGetToken(string email = "sostest@example.com")
    {
        var payload = new
        {
            name = "SOS Test User",
            email,
            password = "SOSPassword123!",
        };

        var content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");

        var response = await PostAsync("/api/v1/auth/register", content);
        var json = JsonSerializer.Deserialize<JsonElement>(
            await response.Content.ReadAsStringAsync());

        json.TryGetProperty("accessToken", out var token);
        return token.GetString() ?? throw new InvalidOperationException("No token in response");
    }

    /// <summary>
    /// Test: POST /api/v1/sos/trigger with valid auth should return 201 with eventId
    /// </summary>
    [Fact]
    public async Task TriggerSos_WithValidAuth_ShouldReturn201WithEventId()
    {
        // Arrange
        var token = await CreateTestUserAndGetToken();

        var sosTriggerPayload = new
        {
            circleIds = new Guid[] { Guid.NewGuid() },
            lat = 40.7128,
            lng = -74.0060
        };

        var content = new StringContent(
            JsonSerializer.Serialize(sosTriggerPayload),
            Encoding.UTF8,
            "application/json");

        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        // Act
        var response = await PostAsync("/api/v1/sos/trigger", content);

        // Assert
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var json = JsonSerializer.Deserialize<JsonElement>(
            await response.Content.ReadAsStringAsync());

        Assert.True(json.TryGetProperty("eventId", out var eventId));
        Assert.NotEqual(default, Guid.Parse(eventId.GetString() ?? ""));
    }

    /// <summary>
    /// Test: POST /api/v1/sos/trigger without auth should return 401
    /// </summary>
    [Fact]
    public async Task TriggerSos_WithoutAuth_ShouldReturn401()
    {
        // Arrange
        var sosTriggerPayload = new
        {
            circleIds = new Guid[] { Guid.NewGuid() },
            lat = 40.7128,
            lng = -74.0060
        };

        var content = new StringContent(
            JsonSerializer.Serialize(sosTriggerPayload),
            Encoding.UTF8,
            "application/json");

        // Don't add Authorization header

        // Act
        var response = await PostAsync("/api/v1/sos/trigger", content);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// Test: POST /api/v1/sos/trigger with empty circleIds should return 400
    /// </summary>
    [Fact]
    public async Task TriggerSos_WithEmptyCircleIds_ShouldReturn400()
    {
        // Arrange
        var token = await CreateTestUserAndGetToken();

        var sosTriggerPayload = new
        {
            circleIds = new Guid[] { }, // Empty array
            lat = 40.7128,
            lng = -74.0060
        };

        var content = new StringContent(
            JsonSerializer.Serialize(sosTriggerPayload),
            Encoding.UTF8,
            "application/json");

        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        // Act
        var response = await PostAsync("/api/v1/sos/trigger", content);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
