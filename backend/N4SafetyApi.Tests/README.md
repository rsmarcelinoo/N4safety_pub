# N4SafetyApi Integration Tests

This project contains integration tests for the N4Safety API using xUnit and WebApplicationFactory.

## Test Structure

### IntegrationTestBase
Base class that all integration tests inherit from. Provides:
- `WebApplicationFactory<Program>` for creating a test server
- `HttpClient` for making requests
- `TestDatabaseFixture` for isolated test database

### Test Classes

#### AuthIntegrationTests
Tests for authentication endpoints:
- `HealthCheck_ShouldReturnHealthy` — GET /health returns 200 with "Healthy" status
- `Register_WithValidData_ShouldCreateAccount` — POST /auth/register creates account (201)
- `Register_WithDuplicateEmail_ShouldReturn409` — Duplicate email returns 409 Conflict
- `Register_WithMissingFields_ShouldReturn400` — Missing required fields returns 400
- `Login_WithCorrectCredentials_ShouldReturnToken` — Login with correct password (200)
- `Login_WithWrongPassword_ShouldReturn401` — Wrong password returns 401 Unauthorized

#### SosIntegrationTests
Tests for SOS endpoints:
- `TriggerSos_WithValidAuth_ShouldReturn201WithEventId` — POST /sos/trigger with JWT (201)
- `TriggerSos_WithoutAuth_ShouldReturn401` — Missing JWT returns 401
- `TriggerSos_WithEmptyCircleIds_ShouldReturn400` — Empty circleIds returns 400

## Running the Tests

### Prerequisites
1. PostgreSQL 16+ running on localhost:5432
2. .NET 8 SDK
3. Credentials: username `postgres`, password `postgres` (or update TestDatabaseFixture)

### Run Tests
```bash
cd backend
dotnet test N4SafetyApi.Tests
```

### Run Specific Test
```bash
dotnet test N4SafetyApi.Tests --filter "HealthCheck_ShouldReturnHealthy"
```

### Run with Verbose Output
```bash
dotnet test N4SafetyApi.Tests --verbosity detailed
```

## Test Database

Each test run creates an isolated PostgreSQL database:
- Database name: `n4safety_test_{GUID}` (limited to 63 chars)
- Migrations are applied automatically via `run_all.sh`
- Database is dropped after tests complete

## Implementation Notes

- Tests use JSON serialization with System.Text.Json
- All tests are marked with `[Fact]` (independent tests)
- No shared state between tests (isolated DB per fixture)
- Bearer token authentication is tested via Authorization header
- Validation tests verify error codes match business logic (400, 401, 409)

## Future Enhancements

- Add Circles CRUD integration tests
- Add Locations CRUD integration tests
- Add user profile update tests
- Add RLS (Row Level Security) verification tests
- Implement performance benchmarks
- Add container-based PostgreSQL fixture (testcontainers-dotnet)
