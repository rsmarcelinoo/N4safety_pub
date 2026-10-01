-- ─── HEATMAP: TIME-OF-DAY FACTOR ─────────────────────────────────────────────
-- Replaces fn_heatmap_points_in_bbox from 010 with a version that applies
-- a time-of-day modifier so night-time reports have full weight at night
-- and are dampened during the day (and vice versa).
--
-- Example: Cais do Sodré reports at 02:00 AM appear at full weight at 01:00 AM
-- but are dampened to ~40% at 13:00 PM, since the area's risk profile differs.
--
-- Time modifier formula (cosine smoothing):
--   hour_diff = circular distance between report hour and current hour (0-12)
--   time_mod  = 0.40 + 0.60 × (1 + cos(π × hour_diff / 12)) / 2
--
-- Results:
--   Same hour (0h diff):    time_mod = 1.00  (full weight)
--   6h apart:               time_mod = 0.70  (70%)
--   12h apart (opposite):   time_mod = 0.40  (40% — never silent)
--
-- Timezone: Europe/Lisbon is used so "night" aligns with local experience.

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
        LEAST(1.0, (
            r.base_points::float
            * COALESCE(uc.score, 1.0)
            -- Time decay: 4% floor, half-life ≈ 14 days
            * (0.04 + 0.96 * EXP(
                -0.05 * EXTRACT(epoch FROM (now() - r.reported_at)) / 86400.0
              ))
            -- Frequency bonus: more nearby reports = higher weight
            * (1.0 + LN(1.0 + nc.nearby_30d) / 4.0)
            -- Time-of-day: reports at similar time-of-day have higher relevance
            * (0.40 + 0.60 * (
                1.0 + COS(
                    PI() * LEAST(
                        ABS(ch.h - EXTRACT(HOUR FROM r.reported_at AT TIME ZONE 'Europe/Lisbon')::float),
                        24.0 - ABS(ch.h - EXTRACT(HOUR FROM r.reported_at AT TIME ZONE 'Europe/Lisbon')::float)
                    ) / 12.0
                )
              ) / 2.0)
        ) / 100.0) AS weight
    FROM incident_reports r
    CROSS JOIN curr_hour ch
    LEFT JOIN user_credibility uc ON uc.user_id = r.user_id
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::float AS nearby_30d
        FROM incident_reports r2
        WHERE r2.id        != r.id
          AND r2.reported_at > now() - INTERVAL '30 days'
          AND ST_DWithin(r.geom::geography, r2.geom::geography, 150)
    ) nc
    WHERE r.geom && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
      AND r.reported_at > now() - INTERVAL '1 year';
$$;
