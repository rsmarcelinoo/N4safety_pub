namespace N4SafetyApi.Models;

using System.ComponentModel.DataAnnotations;

// ─── Auth DTOs ────────────────────────────────────────────────────────────────

public record RegisterRequest(
    [Required(ErrorMessage = "Name is required.")]
    [StringLength(255, MinimumLength = 1, ErrorMessage = "Name must be 1-255 characters.")]
    string Name,
    
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email format.")]
    string Email,
    
    [Required(ErrorMessage = "Password is required.")]
    [StringLength(255, MinimumLength = 8, ErrorMessage = "Password must be at least 8 characters.")]
    string Password,
    
    [Phone(ErrorMessage = "Invalid phone format.")]
    string? Phone,

    [Range(13, 150, ErrorMessage = "Age must be between 13 and 150.")]
    int? Age);

public record LoginRequest(
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email format.")]
    string Email,
    
    [Required(ErrorMessage = "Password is required.")]
    string Password);

public record RefreshRequest(
    [Required(ErrorMessage = "RefreshToken is required.")]
    string RefreshToken);

public record AuthResponse(
    string  AccessToken,
    string  RefreshToken,
    long    ExpiresAt,      // Unix ms
    UserDto User);

// ─── User DTOs ────────────────────────────────────────────────────────────────

public record UserDto(
    Guid    Id,
    string  Email,
    string  Name,
    string? Phone,
    string? AvatarUrl,
    int?  Age);

public record UpdateUserRequest(
    [StringLength(255, MinimumLength = 1, ErrorMessage = "Name must be 1-255 characters.")]
    string? Name,
    
    [Phone(ErrorMessage = "Invalid phone format.")]
    string? Phone,
    
    [Range(13, 150, ErrorMessage = "Age must be between 13 and 150.")]
    int? Age,
    
    [Url(ErrorMessage = "Invalid URL format.")]
    string? AvatarUrl);

public record PushTokenRequest(
    [Required(ErrorMessage = "Token is required.")]
    string Token,
    
    [Required(ErrorMessage = "Platform is required.")]
    [RegularExpression("^(ios|android)$", ErrorMessage = "Platform must be 'ios' or 'android'.")]
    string Platform);

// ─── Circle DTOs ─────────────────────────────────────────────────────────────

public record CircleMemberDto(
    string  Name,
    string  Phone,
    Guid?   UserId);

public record CircleDto(
    Guid                     Id,
    string                   Name,
    bool                     IsActive,
    bool                     AlertSos,
    bool                     AlertNotification,
    bool                     AlertEmergencyServices,
    DateTime                 CreatedAt,
    List<CircleMemberDto>?   Members = null);     // nullable — populated after the main query

public record CreateCircleRequest(
    [Required(ErrorMessage = "Name is required.")]
    [StringLength(255, MinimumLength = 1, ErrorMessage = "Name must be 1-255 characters.")]
    string Name,
    
    bool IsActive               = false,
    bool AlertSos               = true,
    bool AlertNotification      = true,
    bool AlertEmergencyServices = false,
    List<CircleMemberDto>? Members = null);

public record UpdateCircleRequest(
    [Required(ErrorMessage = "Name is required.")]
    [StringLength(255, MinimumLength = 1, ErrorMessage = "Name must be 1-255 characters.")]
    string Name,
    
    bool IsActive,
    bool AlertSos,
    bool AlertNotification,
    bool AlertEmergencyServices,
    
    [Required(ErrorMessage = "Members is required.")]
    List<CircleMemberDto> Members);

public record CircleMembershipDto(
    Guid     CircleId,
    string   CircleName,
    string   OwnerName,
    Guid     OwnerId,
    bool     IsActive,
    bool     AlertSos,
    bool     AlertNotification,
    bool     AlertEmergencyServices,
    DateTime AddedAt);

// ─── SOS DTOs ────────────────────────────────────────────────────────────────

public record TriggerSosRequest(
    [Required(ErrorMessage = "CircleIds is required.")]
    [MinLength(1, ErrorMessage = "At least one CircleId is required.")]
    Guid[] CircleIds,
    
    [Range(-90, 90, ErrorMessage = "Latitude must be between -90 and 90.")]
    double? Lat,
    
    [Range(-180, 180, ErrorMessage = "Longitude must be between -180 and 180.")]
    double? Lng);

public record SosEventDto(
    Guid      Id,
    Guid      UserId,
    DateTime  TriggeredAt,
    DateTime? CancelledAt,
    double?   Lat,
    double?   Lng,
    Guid[]?   CircleIds);   // nullable for safety — Dapper/Npgsql array mapping

public record SosLocationDto(
    Guid     EventId,
    double   Lat,
    double   Lng,
    DateTime RecordedAt);

// ─── Map DTOs ────────────────────────────────────────────────────────────────

public record DangerZoneFeature(
    string                Type,             // "Feature"
    object                Geometry,         // raw parsed GeoJSON
    DangerZoneProperties  Properties);

public record DangerZoneProperties(
    Guid   Id,
    string Label,
    string RiskLevel);

public record DangerZoneCollection(
    string                   Type,          // "FeatureCollection"
    List<DangerZoneFeature>  Features);

// ─── Saved Location DTOs ─────────────────────────────────────────────────────

public record SavedLocationDto(
    Guid     Id,
    string   Name,
    string   Address,
    double   Lat,
    double   Lng,
    DateTime AddedAt);

public record CreateLocationRequest(
    [Required(ErrorMessage = "Name is required.")]
    [StringLength(255, MinimumLength = 1, ErrorMessage = "Name must be 1-255 characters.")]
    string Name,
    
    [Required(ErrorMessage = "Address is required.")]
    [StringLength(500, MinimumLength = 1, ErrorMessage = "Address must be 1-500 characters.")]
    string Address,
    
    [Required(ErrorMessage = "Lat is required.")]
    [Range(-90, 90, ErrorMessage = "Latitude must be between -90 and 90.")]
    double Lat,
    
    [Required(ErrorMessage = "Lng is required.")]
    [Range(-180, 180, ErrorMessage = "Longitude must be between -180 and 180.")]
    double Lng);

// ─── Internal DB row types (never returned to clients) ───────────────────────

public record UserRow(
    Guid    Id,
    string  Email,
    string  Name,
    string? PasswordHash,
    string? Phone,
    string? AvatarUrl,
    int?  Age);

public record SosRecipientRow(Guid UserId, string Name, string Phone);
public record SosLocationRow(Guid EventId, double Lat, double Lng, DateTime RecordedAt);
public record SmsRecipientRow(string Phone, string Name, string OwnerName);
public record DangerZoneRow(Guid Id, string Label, string RiskLevel, string GeoJson);

// ─── Incident Report DTOs ────────────────────────────────────────────────────

public record CreateReportRequest(
    [Required(ErrorMessage = "Type is required.")]
    [RegularExpression("^(poor_lighting|suspicious_person|harassment|theft|assault|fight)$",
        ErrorMessage = "Type must be one of: poor_lighting, suspicious_person, harassment, theft, assault, fight.")]
    string Type,

    [Required(ErrorMessage = "Lat is required.")]
    [Range(-90, 90, ErrorMessage = "Latitude must be between -90 and 90.")]
    double Lat,

    [Required(ErrorMessage = "Lng is required.")]
    [Range(-180, 180, ErrorMessage = "Longitude must be between -180 and 180.")]
    double Lng);

public record ReportDto(Guid Id, string Type, double Lat, double Lng, DateTime ReportedAt);

// ─── Heatmap DTOs ────────────────────────────────────────────────────────────

public record HeatmapPoint(double Lat, double Lng, double Weight);

// HeatmapCollection is serialised manually in MapController as GeoJSON
// to avoid a heavyweight serialisation dependency on the FeatureCollection shape.

// ─── Area Summary DTOs ─────────────────────────────────────────────────

public record AreaSummaryDto(
    int TotalReports,
    int Recent24h,
    string? TopType,
    double RiskScore,
    int? RiskiestHour,
    int? SafestHour,
    Dictionary<string, int> Breakdown);

public record SafeCheckinRequest(
    [Required(ErrorMessage = "Lat is required.")]
    [Range(-90, 90, ErrorMessage = "Latitude must be between -90 and 90.")]
    double Lat,

    [Required(ErrorMessage = "Lng is required.")]
    [Range(-180, 180, ErrorMessage = "Longitude must be between -180 and 180.")]
    double Lng);
