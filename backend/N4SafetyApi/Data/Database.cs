using Dapper;
using Npgsql;

namespace N4SafetyApi.Data;

/// <summary>
/// Dapper connection factory backed by NpgsqlDataSource.
/// Using NpgsqlDataSource (Npgsql 8.x) is required for correct UUID[], timestamptz,
/// and other advanced type mappings. Do not use NpgsqlConnection directly.
///
/// Every controller that touches user data calls OpenForUser() which sets
/// app.current_user_id — enforcing PostgreSQL row-level security.
/// </summary>
public sealed class Database : IDisposable
{
    private readonly NpgsqlDataSource _source;

    public Database(IConfiguration config)
    {
        var cs = Environment.GetEnvironmentVariable("DATABASE_URL")
              ?? config.GetConnectionString("DefaultConnection")
              ?? throw new InvalidOperationException("No database connection string configured.");

        _source = new NpgsqlDataSourceBuilder(cs)
            .EnableDynamicJson()    // needed for JSON/JSONB columns
            .Build();
    }

    /// <summary>Returns an open connection. Caller must dispose.</summary>
    public NpgsqlConnection CreateConnection() => _source.CreateConnection();

    /// <summary>
    /// Opens a connection and sets the PostgreSQL session variable that
    /// row-level security policies read to filter rows by user.
    /// Returns a <see cref="UserScopedConnection"/> that explicitly resets
    /// app.current_user_id on dispose before returning to the pool.
    /// Use <c>await using</c> in every protected endpoint.
    /// </summary>
    public async Task<UserScopedConnection> OpenForUser(Guid userId)
    {
        var conn = _source.CreateConnection();
        await conn.OpenAsync();
        await conn.ExecuteAsync($"SET app.current_user_id = '{userId:D}'");
        return new UserScopedConnection(conn);
    }

    public void Dispose() => _source.Dispose();
}

/// <summary>
/// Wraps a user-scoped NpgsqlConnection. On async dispose, explicitly resets
/// app.current_user_id before returning the connection to the pool.
/// Npgsql 8 + NpgsqlDataSource also performs a connection reset on pool return,
/// but the explicit RESET here provides belt-and-suspenders safety for a
/// security-sensitive app where row leakage across users would be critical.
/// </summary>
public sealed class UserScopedConnection : IAsyncDisposable
{
    public NpgsqlConnection Conn { get; }

    internal UserScopedConnection(NpgsqlConnection conn) => Conn = conn;

    public async ValueTask DisposeAsync()
    {
        try { await Conn.ExecuteAsync("RESET app.current_user_id"); } catch { /* best-effort */ }
        await Conn.DisposeAsync();
    }
}
