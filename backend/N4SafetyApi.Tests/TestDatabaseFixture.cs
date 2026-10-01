using System;
using System.IO;
using System.Threading.Tasks;
using Npgsql;
using Xunit;

namespace N4SafetyApi.Tests;

/// <summary>
/// TestDatabase fixture for integration tests.
/// Creates an isolated PostgreSQL database for each test run.
/// </summary>
public class TestDatabaseFixture : IAsyncLifetime
{
    private readonly string _connectionString;
    private readonly string _testDbName = $"n4safety_test_{Guid.NewGuid():N}".Substring(0, 63); // PostgreSQL name limit

    public TestDatabaseFixture()
    {
        // Connect to postgres default database to create test DB
        var templateConn = "Host=localhost;Database=postgres;Username=postgres;Password=postgres;";
        _connectionString = $"Host=localhost;Database={_testDbName};Username=postgres;Password=postgres;";
        CreateDatabase(templateConn);
    }

    public string ConnectionString => _connectionString;

    public async Task InitializeAsync()
    {
        // Run migrations on test database
        await RunMigrations();
    }

    public async Task DisposeAsync()
    {
        // Drop test database
        var conn = "Host=localhost;Database=postgres;Username=postgres;Password=postgres;";
        using (var pgConn = new NpgsqlConnection(conn))
        {
            await pgConn.OpenAsync();
            // Close active connections to test DB
            using (var cmd = pgConn.CreateCommand())
            {
                cmd.CommandText = $@"SELECT pg_terminate_backend(pg_stat_activity.pid)
                    FROM pg_stat_activity
                    WHERE pg_stat_activity.datname = '{_testDbName}'
                    AND pid <> pg_backend_pid();";
                await cmd.ExecuteNonQueryAsync();
            }
            // Drop the database
            using (var cmd = pgConn.CreateCommand())
            {
                cmd.CommandText = $"DROP DATABASE IF EXISTS {_testDbName};";
                await cmd.ExecuteNonQueryAsync();
            }
        }
    }

    private void CreateDatabase(string templateConn)
    {
        using (var conn = new NpgsqlConnection(templateConn))
        {
            conn.Open();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = $"CREATE DATABASE {_testDbName};";
                cmd.ExecuteNonQuery();
            }
        }
    }

    private async Task RunMigrations()
    {
        // For now, migrations are run via shell script in CI/CD
        // In a real integration test scenario, this would be automated here
        var scriptPath = Path.Combine(
            AppContext.BaseDirectory,
            "..", "..", "..", "..",
            "database", "run_all.sh"
        );

        if (File.Exists(scriptPath))
        {
            var process = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "bash",
                Arguments = scriptPath,
                EnvironmentVariables = { { "DB_URL", $"postgresql://postgres:postgres@localhost:5432/{_testDbName}" } },
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });

            await process!.WaitForExitAsync();
            if (process.ExitCode != 0)
            {
                var error = await process.StandardError.ReadToEndAsync();
                throw new InvalidOperationException($"Migration failed: {error}");
            }
        }
    }
}
