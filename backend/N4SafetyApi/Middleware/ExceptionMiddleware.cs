namespace N4SafetyApi.Middleware;

/// <summary>
/// Global exception handler. Converts all unhandled exceptions into a
/// consistent JSON error response so the mobile app always gets { "error": "..." }
/// instead of HTML 500 pages or empty bodies.
/// </summary>
public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _log;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> log)
    {
        _next = next;
        _log  = log;
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await _next(ctx);
        }
        catch (Exception ex)
        {
            await HandleAsync(ctx, ex);
        }
    }

    private async Task HandleAsync(HttpContext ctx, Exception ex)
    {
        var (status, message) = ex switch
        {
            UnauthorizedAccessException => (401, ex.Message switch
            {
                "INVALID_CREDENTIALS" => "Invalid email or password.",
                _                     => "Authentication required.",
            }),
            ArgumentException         => (400, ex.Message),
            InvalidOperationException => ex.Message switch
            {
                "EMAIL_TAKEN" => (409, "This email is already registered."),
                _             => (400, ex.Message),
            },
            KeyNotFoundException      => (404, ex.Message),
            _                         => (500, "An internal error occurred.")
        };

        if (status == 500)
            _log.LogError(ex, "Unhandled exception on {Method} {Path}",
                ctx.Request.Method, ctx.Request.Path);

        ctx.Response.StatusCode  = status;
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsJsonAsync(new { error = message });
    }
}
