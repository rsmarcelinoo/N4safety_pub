using Dapper;
using N4SafetyApi.Data;
using N4SafetyApi.Models;

namespace N4SafetyApi.Services;

public class AuthService
{
    private readonly Database   _db;
    private readonly JwtService _jwt;

    public AuthService(Database db, JwtService jwt)
    {
        _db  = db;
        _jwt = jwt;
    }

    // ─── Register ─────────────────────────────────────────────────────────────

    public async Task<AuthResponse> Register(RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))  throw new ArgumentException("Name is required.");
        if (!req.Email.Contains('@'))             throw new ArgumentException("Invalid email address.");
        if (req.Password.Length < 6)             throw new ArgumentException("Password must be at least 6 characters.");

        var hash = BCrypt.Net.BCrypt.HashPassword(req.Password, workFactor: 12);

        using var conn = _db.CreateConnection();
        await conn.OpenAsync();

        Guid userId;
        try
        {
            userId = await conn.QuerySingleAsync<Guid>(@"
                INSERT INTO users (email, password_hash, name, phone, age)
                VALUES (@Email, @Hash, @Name, @Phone, @Age)
                RETURNING id",
                new { Email = req.Email.ToLower().Trim(), Hash = hash, req.Name, req.Phone, req.Age });
        }
        catch (Npgsql.PostgresException ex) when (ex.SqlState == "23505")
        {
            throw new InvalidOperationException("EMAIL_TAKEN");
        }

        return await BuildAuthResponse(conn, userId);
    }

    // ─── Login ────────────────────────────────────────────────────────────────

    public async Task<AuthResponse> Login(LoginRequest req)
    {
        using var conn = _db.CreateConnection();
        await conn.OpenAsync();

        var row = await conn.QuerySingleOrDefaultAsync(@"
            SELECT id, email, name, password_hash
            FROM users WHERE email = @Email",
            new { Email = req.Email.ToLower().Trim() });

        if (row is null) throw new UnauthorizedAccessException("INVALID_CREDENTIALS");

        var pwHash = (string?)row.password_hash;
        if (string.IsNullOrEmpty(pwHash))
            throw new UnauthorizedAccessException("INVALID_CREDENTIALS");

        if (!BCrypt.Net.BCrypt.Verify(req.Password, pwHash))
            throw new UnauthorizedAccessException("INVALID_CREDENTIALS");

        return await BuildAuthResponse(conn, (Guid)row.id);
    }

    // ─── Refresh ──────────────────────────────────────────────────────────────

    public async Task<AuthResponse> Refresh(string rawToken)
    {
        var hash = _jwt.HashRefreshToken(rawToken);

        using var conn = _db.CreateConnection();
        await conn.OpenAsync();

        var row = await conn.QuerySingleOrDefaultAsync<(Guid UserId, DateTime ExpiresAt, bool Revoked)>(@"
            SELECT user_id AS UserId, expires_at AS ExpiresAt, revoked
            FROM refresh_tokens
            WHERE token_hash = @Hash",
            new { Hash = hash });

        if (row == default || row.Revoked || row.ExpiresAt < DateTime.UtcNow)
            throw new UnauthorizedAccessException("Refresh token is invalid or expired.");

        // Revoke the old token — a stolen refresh token is now invalidated on first use
        await conn.ExecuteAsync(
            "UPDATE refresh_tokens SET revoked = true WHERE token_hash = @Hash",
            new { Hash = hash });

        return await BuildAuthResponse(conn, row.UserId);
    }

    // ─── Logout ───────────────────────────────────────────────────────────────

    public async Task Logout(string rawToken)
    {
        var hash = _jwt.HashRefreshToken(rawToken);
        using var conn = _db.CreateConnection();
        await conn.OpenAsync();
        await conn.ExecuteAsync(
            "UPDATE refresh_tokens SET revoked = true WHERE token_hash = @Hash",
            new { Hash = hash });
    }

    // ─── BuildAuthResponse ────────────────────────────────────────────────────

    private async Task<AuthResponse> BuildAuthResponse(Npgsql.NpgsqlConnection conn, Guid userId)
    {
        var row = await conn.QuerySingleAsync(@"
            SELECT id, email, name, phone, avatar_url, age
            FROM users WHERE id = @Id",
            new { Id = userId });

        var user = new UserDto(
            Id: (Guid)row.id,
            Email: (string)row.email,
            Name: (string)row.name,
            Phone: (string?)row.phone,
            AvatarUrl: (string?)row.avatar_url,
            Age: row.age != null ? (int?)Convert.ToInt32(row.age) : null
        );

        var (accessToken, expiresAt) = _jwt.GenerateAccessToken(userId, user.Email, user.Name);
        var rawRefresh               = _jwt.GenerateRefreshToken();
        var hashRefresh              = _jwt.HashRefreshToken(rawRefresh);

        await conn.ExecuteAsync(@"
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES (@UserId, @Hash, @Expiry)",
            new { UserId = userId, Hash = hashRefresh, Expiry = _jwt.RefreshExpiry() });

        return new AuthResponse(accessToken, rawRefresh, expiresAt, user);
    }
}
