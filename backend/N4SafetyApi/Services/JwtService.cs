using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace N4SafetyApi.Services;

public class JwtService
{
    private readonly string _secret;
    private readonly int    _accessMinutes;
    private readonly int    _refreshDays;

    public JwtService(IConfiguration config)
    {
        _secret        = config["Jwt:Secret"]             ?? throw new InvalidOperationException("Jwt:Secret not set");
        _accessMinutes = int.Parse(config["Jwt:AccessTokenMinutes"]  ?? "15");
        _refreshDays   = int.Parse(config["Jwt:RefreshTokenDays"]    ?? "30");
    }

    // ─── Access token ──────────────────────────────────────────────────────────

    public (string token, long expiresAt) GenerateAccessToken(Guid userId, string email, string name)
    {
        var key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds   = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(_accessMinutes);

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub,   userId.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, email),
                new Claim("name",                        name),
            }),
            Expires            = expires,
            SigningCredentials = creds,
            Issuer             = "n4safety-api",
            Audience           = "n4safety-app",
        };

        var handler = new JwtSecurityTokenHandler();
        var token   = handler.CreateToken(descriptor);
        return (handler.WriteToken(token), new DateTimeOffset(expires).ToUnixTimeMilliseconds());
    }

    public ClaimsPrincipal? ValidateAccessToken(string token)
    {
        var key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var handler = new JwtSecurityTokenHandler();
        try
        {
            return handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey         = key,
                ValidateIssuer           = true,
                ValidIssuer              = "n4safety-api",
                ValidateAudience         = true,
                ValidAudience            = "n4safety-app",
                ValidateLifetime         = true,
                ClockSkew                = TimeSpan.Zero,
            }, out _);
        }
        catch { return null; }
    }

    // ─── Refresh token ─────────────────────────────────────────────────────────

    public string GenerateRefreshToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));

    public string HashRefreshToken(string raw) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLower();

    public DateTime RefreshExpiry() => DateTime.UtcNow.AddDays(_refreshDays);

    // ─── Helper: extract userId from HttpContext ────────────────────────────────

    public static Guid GetUserId(ClaimsPrincipal user)
    {
        var sub = user.FindFirstValue(JwtRegisteredClaimNames.Sub)
               ?? user.FindFirstValue(ClaimTypes.NameIdentifier)
               ?? throw new UnauthorizedAccessException("No sub claim in token.");
        return Guid.Parse(sub);
    }
}
