using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace N4SafetyApi.Tests;

/// <summary>
/// Base class for integration tests using WebApplicationFactory.
/// Provides a test HTTP client and isolated test database.
/// </summary>
public class IntegrationTestBase : IAsyncLifetime
{
    protected TestDatabaseFixture _dbFixture = null!;
    protected WebApplicationFactory<Program> _factory = null!;
    protected HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        // Initialize test database
        _dbFixture = new TestDatabaseFixture();
        await _dbFixture.InitializeAsync();

        // Create test factory with test database connection
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                // Override connection string to use test database
                builder.ConfigureServices(services =>
                {
                    // Remove the default DbContextOptions
                    var descriptor = services.FirstOrDefault(d =>
                        d.ServiceType.Name == "DbContextOptions`1");
                    if (descriptor != null)
                        services.Remove(descriptor);

                    // Add services with test configuration
                    services.AddSingleton(_dbFixture);
                });

                // Set environment variable for connection string override
                builder.UseSetting("ConnectionStrings:DefaultConnection", _dbFixture.ConnectionString);
            });

        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client?.Dispose();
        _factory?.Dispose();
        if (_dbFixture != null)
            await _dbFixture.DisposeAsync();
    }

    protected Task<HttpResponseMessage> PostAsync(string url, HttpContent content)
        => _client.PostAsync(url, content);

    protected Task<HttpResponseMessage> GetAsync(string url)
        => _client.GetAsync(url);

    protected async Task<T?> GetJsonAsync<T>(HttpResponseMessage response)
    {
        var json = await response.Content.ReadAsStringAsync();
        return System.Text.Json.JsonSerializer.Deserialize<T>(json);
    }
}
