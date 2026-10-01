-- ─── SOS EVENTS ──────────────────────────────────────────────────────────────
-- One row per SOS trigger. circle_ids is a UUID array snapshot of which circles
-- were alerted at trigger time — we snapshot so that deleting a circle later
-- doesn't corrupt history.
-- geom stores the initial trigger coordinates (PostGIS Point, SRID 4326).
-- cancelled_at NULL means the event is still active or was never cancelled.

CREATE TABLE IF NOT EXISTS sos_events (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users (id),
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,                             -- NULL = active / resolved
    geom         GEOMETRY(Point, 4326),                   -- initial trigger location
    circle_ids   UUID[]      NOT NULL DEFAULT '{}'::UUID[],
    -- Denormalised for quick display (avoids join on every history read)
    lat          DOUBLE PRECISION GENERATED ALWAYS AS (ST_Y(geom)) STORED,
    lng          DOUBLE PRECISION GENERATED ALWAYS AS (ST_X(geom)) STORED
);

CREATE INDEX IF NOT EXISTS idx_sos_events_user     ON sos_events (user_id);
CREATE INDEX IF NOT EXISTS idx_sos_events_active   ON sos_events (user_id)
    WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sos_events_geom     ON sos_events USING GIST (geom)
    WHERE geom IS NOT NULL;


-- ─── SOS LOCATION STREAM ─────────────────────────────────────────────────────
-- GPS pings sent every 5 seconds during an active SOS via SignalR.
-- Consumed by circle members to render a live map of the distressed user.
-- Old rows (> 48h) should be archived or deleted by a scheduled job.

CREATE TABLE IF NOT EXISTS sos_location_stream (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES sos_events (id) ON DELETE CASCADE,
    geom        GEOMETRY(Point, 4326) NOT NULL,
    lat         DOUBLE PRECISION GENERATED ALWAYS AS (ST_Y(geom)) STORED,
    lng         DOUBLE PRECISION GENERATED ALWAYS AS (ST_X(geom)) STORED,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sos_stream_event      ON sos_location_stream (event_id);
CREATE INDEX IF NOT EXISTS idx_sos_stream_event_time ON sos_location_stream (event_id, recorded_at DESC);


-- ─── SOS LATEST LOCATION VIEW ────────────────────────────────────────────────
-- Returns the single most-recent location point per active SOS event.
-- Circle members poll this (or receive it via SignalR push) to show current position.

CREATE OR REPLACE VIEW v_sos_latest_location AS
    SELECT DISTINCT ON (s.event_id)
        s.event_id,
        s.lat,
        s.lng,
        s.recorded_at,
        e.user_id,
        e.cancelled_at
    FROM sos_location_stream s
    JOIN sos_events           e ON e.id = s.event_id
    ORDER BY s.event_id, s.recorded_at DESC;
