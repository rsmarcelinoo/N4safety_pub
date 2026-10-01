-- ─── STORED PROCEDURES & HELPERS ─────────────────────────────────────────────


-- fn_danger_zones_in_bbox
-- Returns all danger zones whose geometry intersects a given bounding box.
-- Called by GET /api/v1/map/danger-zones?bbox=minLng,minLat,maxLng,maxLat
-- bbox params are EPSG:4326 degrees.

CREATE OR REPLACE FUNCTION fn_danger_zones_in_bbox(
    p_min_lng DOUBLE PRECISION,
    p_min_lat DOUBLE PRECISION,
    p_max_lng DOUBLE PRECISION,
    p_max_lat DOUBLE PRECISION
)
RETURNS TABLE (
    id         UUID,
    label      TEXT,
    risk_level TEXT,
    geojson    JSON
) LANGUAGE sql STABLE AS $$
    SELECT
        dz.id,
        dz.label,
        dz.risk_level,
        ST_AsGeoJSON(dz.geom)::JSON AS geojson
    FROM danger_zones dz
    WHERE dz.geom && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);
$$;


-- fn_get_active_sos_recipients
-- Given an SOS event id, returns every user_id that should receive a push
-- notification (i.e. registered circle members across all alerted circles).
-- The SOS controller calls this to build its push dispatch list.

CREATE OR REPLACE FUNCTION fn_get_active_sos_recipients(p_event_id UUID)
RETURNS TABLE (
    user_id  UUID,
    name     TEXT,
    phone    TEXT
) LANGUAGE sql STABLE AS $$
    SELECT DISTINCT
        cm.user_id,
        cm.name,
        cm.phone
    FROM sos_events         e
    JOIN circles            c  ON c.id = ANY(e.circle_ids)
    JOIN circle_members     cm ON cm.circle_id = c.id
    WHERE e.id = p_event_id
      AND cm.user_id IS NOT NULL;    -- registered users only; non-registered get SMS separately
$$;


-- fn_get_sms_recipients
-- Returns phone numbers of circle members who are NOT registered users.
-- These receive SMS via Twilio with the standard template.
-- Template: "Your friend/family member [name] is in danger. Click here to view their location."

CREATE OR REPLACE FUNCTION fn_get_sms_recipients(p_event_id UUID)
RETURNS TABLE (
    phone      TEXT,
    name       TEXT,
    owner_name TEXT
) LANGUAGE sql STABLE AS $$
    SELECT DISTINCT
        cm.phone,
        cm.name,
        u.name AS owner_name
    FROM sos_events     e
    JOIN users          u  ON u.id = e.user_id
    JOIN circles        c  ON c.id = ANY(e.circle_ids)
    JOIN circle_members cm ON cm.circle_id = c.id
    WHERE e.id = p_event_id
      AND cm.user_id IS NULL;        -- unregistered contacts only
$$;


-- fn_cleanup_expired_tokens
-- Deletes revoked and expired refresh tokens. Run via pg_cron or a scheduled job.
-- Keeps the refresh_tokens table lean.

CREATE OR REPLACE FUNCTION fn_cleanup_expired_tokens()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM refresh_tokens
    WHERE revoked = true
       OR expires_at < now() - INTERVAL '1 day';   -- 1-day grace period for race conditions
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
