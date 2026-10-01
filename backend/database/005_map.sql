-- ─── DANGER ZONES ────────────────────────────────────────────────────────────
-- Polygon overlays rendered on the map with colour-coded risk levels.
-- Geometry is MultiPolygon to support non-contiguous zones under one label.
-- Admin-only creation for MVP; public read via GET /api/v1/map/danger-zones?bbox=.

CREATE TABLE IF NOT EXISTS danger_zones (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    label      TEXT        NOT NULL,
    risk_level TEXT        NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    geom       GEOMETRY(MultiPolygon, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIST spatial index enables fast bbox intersection queries.
CREATE INDEX IF NOT EXISTS idx_danger_zones_geom ON danger_zones USING GIST (geom);

CREATE OR REPLACE TRIGGER trg_danger_zones_updated_at
    BEFORE UPDATE ON danger_zones
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─── SAVED LOCATIONS ─────────────────────────────────────────────────────────
-- User-saved places (weather-app style list in the Locations tab).
-- One row per saved place per user. The "Current Location" card is NOT stored here —
-- it is always derived from live GPS in the app.

CREATE TABLE IF NOT EXISTS saved_locations (
    id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name     TEXT        NOT NULL,                        -- short display name
    address  TEXT        NOT NULL,                        -- full reverse-geocoded address
    geom     GEOMETRY(Point, 4326) NOT NULL,
    lat      DOUBLE PRECISION GENERATED ALWAYS AS (ST_Y(geom)) STORED,
    lng      DOUBLE PRECISION GENERATED ALWAYS AS (ST_X(geom)) STORED,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_locations_user ON saved_locations (user_id);
