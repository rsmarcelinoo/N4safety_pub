# N4Safety API Reference

Base URL (local): `http://localhost:5000`

All error payloads from controller/middleware exceptions use:

```json
{ "error": "message" }
```

Validation failures from `[ApiController]` return HTTP `400` with ASP.NET validation details payload.

## Auth Controller (`/api/v1/auth`)

### `POST /api/v1/auth/register`
- **Auth:** No
- **Rate limit:** Yes (`10/min` per IP)
- **Request body (`RegisterRequest`):**
  - `name` (string, required, 1-255)
  - `email` (string, required, valid email)
  - `password` (string, required, min 8)
  - `phone` (string, optional, phone format)
- **Success:** `201 Created`
- **Response body (`AuthResponse`):**
  - `accessToken` (string)
  - `refreshToken` (string)
  - `expiresAt` (number, Unix ms)
  - `user` (`UserDto`)
- **Errors:** `400` (validation/input), `409` (email taken), `429` (rate limit)

### `POST /api/v1/auth/login`
- **Auth:** No
- **Rate limit:** Yes (`10/min` per IP)
- **Request body (`LoginRequest`):**
  - `email` (string, required, valid email)
  - `password` (string, required)
- **Success:** `200 OK`
- **Response body:** `AuthResponse`
- **Errors:** `400` (validation), `401` (invalid credentials), `429` (rate limit)

### `POST /api/v1/auth/social`
- **Auth:** No
- **Request body (`SocialAuthRequest`):**
  - `provider` (string, required, `apple|google`)
  - `identityToken` (string, required)
- **Success:** `200 OK`
- **Response body:** `AuthResponse`
- **Errors:** `400` (validation/provider/token issues), `401` (invalid social token/provider auth failure)

### `POST /api/v1/auth/refresh`
- **Auth:** No
- **Request body (`RefreshRequest`):**
  - `refreshToken` (string, required)
- **Success:** `200 OK`
- **Response body:** `AuthResponse` (rotated access + refresh token pair)
- **Errors:** `400` (validation), `401` (invalid/expired/revoked token)

### `POST /api/v1/auth/logout`
- **Auth:** Yes (Bearer JWT)
- **Request body (`RefreshRequest`):**
  - `refreshToken` (string, required)
- **Success:** `204 No Content`
- **Errors:** `400` (validation), `401` (missing/invalid bearer token)

## Users Controller (`/api/v1/users`)

### `GET /api/v1/users/me`
- **Auth:** Yes
- **Success:** `200 OK`
- **Response body (`UserDto`):**
  - `id` (uuid)
  - `email` (string)
  - `name` (string)
  - `phone` (string | null)
  - `avatarUrl` (string | null)
  - `age` (number | null)
- **Errors:** `401` (unauthorized), `404` (user not found)

### `PATCH /api/v1/users/me`
- **Auth:** Yes
- **Request body (`UpdateUserRequest`, all optional):**
  - `name` (string, 1-255)
  - `phone` (string, phone format)
  - `age` (number, 13-150)
  - `avatarUrl` (string, valid URL)
- **Success:** `200 OK`
- **Response body:** `UserDto` (updated profile)
- **Errors:** `400` (validation), `401` (unauthorized)

### `POST /api/v1/users/me/push-token`
- **Auth:** Yes
- **Request body (`PushTokenRequest`):**
  - `token` (string, required)
  - `platform` (string, required, `ios|android`)
- **Success:** `204 No Content`
- **Errors:** `400` (validation), `401` (unauthorized)

## Circles Controller (`/api/v1/circles`)

### `GET /api/v1/circles`
- **Auth:** Yes
- **Success:** `200 OK`
- **Response body:** `CircleDto[]`
  - `id` (uuid)
  - `name` (string)
  - `isActive` (bool)
  - `alertSos` (bool)
  - `alertNotification` (bool)
  - `alertEmergencyServices` (bool)
  - `createdAt` (ISO datetime)
  - `members` (`CircleMemberDto[]`)
    - `name` (string)
    - `phone` (string)
    - `userId` (uuid | null)
- **Errors:** `401` (unauthorized)

### `POST /api/v1/circles`
- **Auth:** Yes
- **Request body (`CreateCircleRequest`):**
  - `name` (string, required, 1-255)
  - `isActive` (bool, optional; default `false`)
  - `alertSos` (bool, optional; default `true`)
  - `alertNotification` (bool, optional; default `true`)
  - `alertEmergencyServices` (bool, optional; default `false`)
  - `members` (`CircleMemberDto[]`, optional)
- **Success:** `201 Created`
- **Response body:** `CircleDto` (created circle with members)
- **Errors:** `400` (validation/input), `401` (unauthorized)

### `PUT /api/v1/circles/{id}`
- **Auth:** Yes
- **Path params:**
  - `id` (uuid)
- **Request body (`UpdateCircleRequest`):**
  - `name` (string, required, 1-255)
  - `isActive` (bool, required)
  - `alertSos` (bool, required)
  - `alertNotification` (bool, required)
  - `alertEmergencyServices` (bool, required)
  - `members` (`CircleMemberDto[]`, required)
- **Success:** `200 OK`
- **Response body:** `CircleDto` (updated circle)
- **Errors:** `400` (validation), `401` (unauthorized/not owner)

### `DELETE /api/v1/circles/{id}`
- **Auth:** Yes
- **Path params:**
  - `id` (uuid)
- **Success:** `204 No Content`
- **Errors:** `401` (unauthorized), `404` (not found/not owner)

### `PATCH /api/v1/circles/{id}/toggle`
- **Auth:** Yes
- **Path params:**
  - `id` (uuid)
- **Success:** `200 OK`
- **Response body:** `CircleDto` (post-toggle state)
- **Errors:** `401` (unauthorized), `404` (not found/not owner)

### `GET /api/v1/circles/memberships`
- **Auth:** Yes
- **Success:** `200 OK`
- **Response body:** `CircleMembershipDto[]`
  - `circleId` (uuid)
  - `circleName` (string)
  - `ownerName` (string)
  - `ownerId` (uuid)
  - `isActive` (bool)
  - `alertSos` (bool)
  - `alertNotification` (bool)
  - `alertEmergencyServices` (bool)
  - `addedAt` (ISO datetime)
- **Errors:** `401` (unauthorized)

## Locations Controller (`/api/v1/locations`)

### `GET /api/v1/locations`
- **Auth:** Yes
- **Success:** `200 OK`
- **Response body:** `SavedLocationDto[]`
  - `id` (uuid)
  - `name` (string)
  - `address` (string)
  - `lat` (number)
  - `lng` (number)
  - `addedAt` (ISO datetime)
- **Errors:** `401` (unauthorized)

### `POST /api/v1/locations`
- **Auth:** Yes
- **Request body (`CreateLocationRequest`):**
  - `name` (string, required, 1-255)
  - `address` (string, required, 1-500)
  - `lat` (number, required, -90..90)
  - `lng` (number, required, -180..180)
- **Success:** `201 Created`
- **Response body:** `SavedLocationDto`
- **Errors:** `400` (validation), `401` (unauthorized)

### `DELETE /api/v1/locations/{id}`
- **Auth:** Yes
- **Path params:**
  - `id` (uuid)
- **Success:** `204 No Content`
- **Errors:** `401` (unauthorized), `404` (not found/not owner)

## SOS Controller (`/api/v1/sos`)

### `POST /api/v1/sos/trigger`
- **Auth:** Yes
- **Request body (`TriggerSosRequest`):**
  - `circleIds` (uuid[], required, min 1)
  - `lat` (number, optional, -90..90)
  - `lng` (number, optional, -180..180)
- **Success:** `201 Created`
- **Response body:**
  - `eventId` (uuid)
  - `triggeredAt` (ISO datetime)
- **Side effects:** async Expo push + Twilio SMS dispatch, SignalR `SOSTriggered`
- **Errors:** `400` (validation/input), `401` (unauthorized)

### `POST /api/v1/sos/{id}/cancel`
- **Auth:** Yes
- **Path params:**
  - `id` (uuid)
- **Success:** `204 No Content`
- **Side effects:** SignalR `SOSCancelled`, async push cancellation broadcast
- **Errors:** `401` (unauthorized), `404` (event not found/already cancelled)

### `GET /api/v1/sos/history`
- **Auth:** Yes
- **Success:** `200 OK`
- **Response body:** `SosEventDto[]`
  - `id` (uuid)
  - `userId` (uuid)
  - `triggeredAt` (ISO datetime)
  - `cancelledAt` (ISO datetime | null)
  - `lat` (number | null)
  - `lng` (number | null)
  - `circleIds` (uuid[] | null)
- **Errors:** `401` (unauthorized)

### `GET /api/v1/sos/{id}/location`
- **Auth:** Yes
- **Path params:**
  - `id` (uuid)
- **Success:** `200 OK`
- **Response body (`SosLocationRow`):**
  - `eventId` (uuid)
  - `lat` (number)
  - `lng` (number)
  - `recordedAt` (ISO datetime)
- **Errors:** `401` (unauthorized), `404` (no location found)

## Map Controller (`/api/v1/map`)

### `GET /api/v1/map/danger-zones`
- **Auth:** No (public)
- **Query params:**
  - `bbox` (optional string: `minLng,minLat,maxLng,maxLat`)
  - Defaults to a Portugal-wide bounding box when omitted/invalid.
- **Success:** `200 OK`
- **Response body (`DangerZoneCollection` GeoJSON):**
  - `type`: `"FeatureCollection"`
  - `features`: array of:
    - `type`: `"Feature"`
    - `geometry`: GeoJSON geometry
    - `properties`:
      - `id` (uuid)
      - `label` (string)
      - `riskLevel` (string; e.g. `low|medium|high`)
- **Errors:** none specific; server errors return `500`

### `POST /api/v1/map/safe-checkin`
- **Auth:** Yes
- **Request body (`SafeCheckinRequest`):**
  - `lat` (number, required, -90..90)
  - `lng` (number, required, -180..180)
- **Success:** `201 Created`
- **Response body:**
  - `lat` (number)
  - `lng` (number)
  - `checkedInAt` (ISO datetime)
- **Side effects:**
  - Inserts `safe_checkin` into `incident_reports` with negative base points (heatmap dampening)
  - Triggers `fn_adjust_user_credibility(userId)`
- **Errors:** `400` (validation), `401` (unauthorized)
