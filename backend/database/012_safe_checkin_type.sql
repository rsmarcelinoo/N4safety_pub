-- ─── SAFE CHECK-IN INCIDENT TYPE + HEATMAP DAMPENING ─────────────────────────
-- Adds safe_checkin as a negative-weight incident report.
-- These points cool local heatmap intensity without deleting existing reports.

DO $$
BEGIN
    ALTER TYPE incident_type ADD VALUE IF NOT EXISTS 'safe_checkin';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Rebuild heatmap function to keep supporting time-of-day relevance while
-- allowing negative-weight points (safe check-ins) to dampen hot areas.
CREATE OR REPLACE FUNCTION fn_heatmap_points_in_bbox(
    p_min_lng DOUBLE PRECISION,
    p_min_lat DOUBLE PRECISION,
    p_max_lng DOUBLE PRECISION,
    p_max_lat DOUBLE PRECISION
)
RETURNS TABLE (
    lat    DOUBLE PRECISION,
    lng    DOUBLE PRECISION,
    weight DOUBLE PRECISION
) LANGUAGE sql STABLE AS $$
    WITH curr_hour AS (
        SELECT EXTRACT(HOUR FROM now() AT TIME ZONE 'Europe/Lisbon')::float AS h
    )
    SELECT
        r.lat,
        r.lng,
        GREATEST(-1.0, LEAST(1.0, (
            r.base_points::float
            * COALESCE(uc.score, 1.0)
            -- Time decay: 4% floor, half-life ≈ 14 days
            * (0.04 + 0.96 * EXP(
                -0.05 * EXTRACT(epoch FROM (now() - r.reported_at)) / 86400.0
              ))
            -- Frequency bonus: more nearby reports = stronger signal
            * (1.0 + LN(1.0 + nc.nearby_30d) / 4.0)
            -- Time-of-day relevance
            * (0.40 + 0.60 * (
                1.0 + COS(
                    PI() * LEAST(
                        ABS(ch.h - EXTRACT(HOUR FROM r.reported_at AT TIME ZONE 'Europe/Lisbon')::float),
                        24.0 - ABS(ch.h - EXTRACT(HOUR FROM r.reported_at AT TIME ZONE 'Europe/Lisbon')::float)
                    ) / 12.0
                )
              ) / 2.0)
        ) / 100.0)) AS weight
    FROM incident_reports r
    CROSS JOIN curr_hour ch
    LEFT JOIN user_credibility uc ON uc.user_id = r.user_id
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::float AS nearby_30d
        FROM incident_reports r2
        WHERE r2.id         != r.id
          AND r2.reported_at > now() - INTERVAL '30 days'
          AND ST_DWithin(r.geom::geography, r2.geom::geography, 150)
    ) nc
    WHERE r.geom && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
      AND r.reported_at > now() - INTERVAL '1 year';
$$;
