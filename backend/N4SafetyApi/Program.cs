using System.Text;
using System.Threading.RateLimiting;
using Dapper;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using N4SafetyApi.Data;
using N4SafetyApi.Hubs;
using N4SafetyApi.Middleware;
using N4SafetyApi.Services;

// Npgsql 8: opt into legacy UTC timestamp behaviour so DateTime works naturally
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

var builder = WebApplication.CreateBuilder(args);

// ─── Core ──────────────────────────────────────────────────────────────────

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
    c.SwaggerDoc("v1", new() { Title = "N4Safety API", Version = "v1" }));

// ─── Database ──────────────────────────────────────────────────────────────

builder.Services.AddSingleton<Database>();

// ─── HTTP clients ──────────────────────────────────────────────────────────

builder.Services.AddHttpClient();

// ─── Business services ─────────────────────────────────────────────────────

builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddSingleton<PushNotificationService>();
builder.Services.AddSingleton<SmsService>();

// ─── SignalR ───────────────────────────────────────────────────────────────

builder.Services.AddSignalR(opts =>
{
    opts.EnableDetailedErrors = builder.Environment.IsDevelopment();
});

// ─── JWT Auth ──────────────────────────────────────────────────────────────

var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret must be configured.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer           = true,
            ValidIssuer              = "n4safety-api",
            ValidateAudience         = true,
            ValidAudience            = "n4safety-app",
            ValidateLifetime         = true,
            ClockSkew                = TimeSpan.Zero,
        };

        // SignalR sends token via query string
        opts.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ─── CORS ──────────────────────────────────────────────────────────────────
// In development we allow all origins so the Expo Metro bundler can reach the
// backend from any LAN IP without hardcoding it here. Production locks it down.

builder.Services.AddCors(opts =>
{
    if (builder.Environment.IsDevelopment())
    {
        opts.AddDefaultPolicy(p =>
            p.SetIsOriginAllowed(_ => true)
             .AllowAnyHeader()
             .AllowAnyMethod()
             .AllowCredentials());
    }
    else
    {
        var allowed = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                   ?? ["https://n4safety.app"];
        opts.AddDefaultPolicy(p =>
            p.WithOrigins(allowed)
             .AllowAnyHeader()
             .AllowAnyMethod()
             .AllowCredentials());
    }
});

// ─── Rate limiting (auth endpoints only — 10 req/min per IP) ───────────────

builder.Services.AddRateLimiter(opts =>
{
    opts.AddFixedWindowLimiter("auth", o =>
    {
        o.PermitLimit          = 10;
        o.Window               = TimeSpan.FromMinutes(1);
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit           = 0;
    });
    opts.RejectionStatusCode = 429;
    opts.OnRejected = async (ctx, _) =>
    {
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsJsonAsync(new
        {
            error = "Too many requests. Please wait a moment."
        });
    };
});

// ─── Health check ──────────────────────────────────────────────────────────

var healthConnStr = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? Environment.GetEnvironmentVariable("DATABASE_URL");

var healthBuilder = builder.Services.AddHealthChecks();
if (!string.IsNullOrEmpty(healthConnStr))
    healthBuilder.AddNpgSql(healthConnStr, name: "postgres");

// ─── App ───────────────────────────────────────────────────────────────────

var app = builder.Build();

// Global exception handler — must be first
app.UseMiddleware<ExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRateLimiter();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<SOSHub>("/hubs/sos");
app.MapHealthChecks("/health");

app.Run();

// Exposed for integration tests (WebApplicationFactory<Program>)
public partial class Program { }
