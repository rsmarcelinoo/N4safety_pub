using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace N4SafetyApi.Middleware;

/// <summary>
/// Extracts userId from the Bearer JWT and stores it in HttpContext.Items["UserId"].
/// Controllers call HttpContext.UserId() to get it without re-parsing the token.
/// </summary>
public static class HttpContextExtensions
{
    public static Guid UserId(this HttpContext ctx)
    {
        if (ctx.Items.TryGetValue("UserId", out var id) && id is Guid guid)
            return guid;

        var sub = ctx.User.FindFirstValue(JwtRegisteredClaimNames.Sub)
               ?? ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (sub is null || !Guid.TryParse(sub, out var parsed))
            throw new UnauthorizedAccessException("No authenticated user.");

        ctx.Items["UserId"] = parsed;
        return parsed;
    }
}
