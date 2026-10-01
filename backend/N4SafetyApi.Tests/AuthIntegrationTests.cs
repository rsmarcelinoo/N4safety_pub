using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Xunit;

namespace N4SafetyApi.Tests;

/// <summary>
/// Integration tests for Auth endpoints:
/// - POST /api/v1/auth/register
/// - POST /api/v1/auth/login
/// - GET /health
/// </summary>
public class AuthIntegrationTests : IntegrationTestBase
{
    /// <summary>
    /// Test: Health check should return Healthy status
    /// </summary>
    [Fact]
    public async Task HealthCheck_ShouldReturnHealthy()
    {
        // Act
        var response = await GetAsync("/health");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonSerializer.Deserialize<JsonElement>(
            await response.Content.ReadAsStringAsync());

        Assert.True(json.TryGetProperty("status", out var status));
        Assert.Equal("Healthy", status.GetString());
    }

    /// <summary>
    /// Test: POST /api/v1/auth/register with valid data should create account
    /// </summary>
    [Fact]
    public async Task Register_WithValidData_ShouldCreateAccount()
    {
        // Arrange
        var payload = new
        {
            name = "Test User",
            email = "test@example.com",
            password = "SecurePassword123!",
            phone = "+1234567890"
        };

        var content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");

        // Act
        var response = await PostAsync("/api/v1/auth/register", content);

        // Assert
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var json = JsonSerializer.Deserialize<JsonElement>(
            await response.Content.ReadAsStringAsync());

        Assert.True(json.TryGetProperty("accessToken", out var token));
        Assert.NotEqual(default, token.GetString()?.Length);

        Assert.True(json.TryGetProperty("user", out var user));
        Assert.True(user.TryGetProperty("email", out var email));
        Assert.Equal("test@example.com", email.GetString());
    }

    /// <summary>
    /// Test: POST /api/v1/auth/register with duplicate email should return 409
    /// </summary>
    [Fact]
    public async Task Register_WithDuplicateEmail_ShouldReturn409()
    {
        // Arrange: Create first account
        var payload = new
        {
            name = "User One",
            email = "duplicate@example.com",
            password = "SecurePassword123!",
            phone = "+1234567890"
        };

        var content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");

        await PostAsync("/api/v1/auth/register", content);

        // Act: Try to create account with same email
        var duplicateContent = new StringContent(
            JsonSerializer.Serialize(new
            {
                name = "User Two",
                email = "duplicate@example.com",
                password = "DifferentPassword456!",
            }),
            Encoding.UTF8,
            "application/json");

        var response = await PostAsync("/api/v1/auth/register", duplicateContent);

        // Assert
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    /// <summary>
    /// Test: POST /api/v1/auth/register with missing fields should return 400
    /// </summary>
    [Fact]
    public async Task Register_WithMissingFields_ShouldReturn400()
    {
        // Arrange: Missing required "name" field
        var payload = new
        {
            email = "missing@example.com",
            password = "SecurePassword123!",
        };

        var content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");

        // Act
        var response = await PostAsync("/api/v1/auth/register", content);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>
    /// Test: POST /api/v1/auth/login with correct credentials should return token
    /// </summary>
    [Fact]
    public async Task Login_WithCorrectCredentials_ShouldReturnToken()
    {
        // Arrange: Create account first
        var registerPayload = new
        {
            name = "Login Test User",
            email = "logintest@example.com",
            password = "CorrectPassword123!",
        };

        var registerContent = new StringContent(
            JsonSerializer.Serialize(registerPayload),
            Encoding.UTF8,
            "application/json");

        await PostAsync("/api/v1/auth/register", registerContent);

        // Act: Login with correct credentials
        var loginPayload = new
        {
            email = "logintest@example.com",
            password = "CorrectPassword123!",
        };

        var loginContent = new StringContent(
            JsonSerializer.Serialize(loginPayload),
            Encoding.UTF8,
            "application/json");

        var response = await PostAsync("/api/v1/auth/login", loginContent);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonSerializer.Deserialize<JsonElement>(
            await response.Content.ReadAsStringAsync());

        Assert.True(json.TryGetProperty("accessToken", out var token));
        Assert.NotEqual(default, token.GetString()?.Length);
    }

    /// <summary>
    /// Test: POST /api/v1/auth/login with wrong password should return 401
    /// </summary>
    [Fact]
    public async Task Login_WithWrongPassword_ShouldReturn401()
    {
        // Arrange: Create account first
        var registerPayload = new
        {
            name = "Login Fail User",
            email = "loginfail@example.com",
            password = "CorrectPassword123!",
        };

        var registerContent = new StringContent(
            JsonSerializer.Serialize(registerPayload),
            Encoding.UTF8,
            "application/json");

        await PostAsync("/api/v1/auth/register", registerContent);

        // Act: Login with wrong password
        var loginPayload = new
        {
            email = "loginfail@example.com",
            password = "WrongPassword456!",
        };

        var loginContent = new StringContent(
            JsonSerializer.Serialize(loginPayload),
            Encoding.UTF8,
            "application/json");

        var response = await PostAsync("/api/v1/auth/login", loginContent);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
