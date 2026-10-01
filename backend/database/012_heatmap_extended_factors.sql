-- ─── HEATMAP: EXTENDED FACTORS (WEEKEND, RECENCY, TYPE CLUSTER) ─────────────
-- Extends fn_heatmap_points_in_bbox with three additional multipliers:
--   1) Weekend-night alignment: 1.3x when both report time and now are weekend nights
--   2) Recency spike: 1.4x for reports within the last 2 hours
--   3) Type clustering: 1.2x if >= 3 same-type reports within 100m over 7 days
--
-- Full formula per point:
-- weight = MIN(1.0,
--   base_points
--   × credibility_score
--   × time_decay
--   × frequency_bonus
--   × time_of_day_mod
--   × weekend_night_factor
--   × recency_boost
--   × type_cluster_bonus
--   / 100.0
-- )

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
        SELECT
            EXTRACT(HOUR FROM now() AT TIME ZONE 'Europe/Lisbon')::float AS h,
            (
                EXTRACT(DOW FROM now() AT TIME ZONE 'Europe/Lisbon')::int IN (5, 6)
                AND (
                    EXTRACT(HOUR FROM now() AT TIME ZONE 'Europe/Lisbon')::int >= 21
                    OR EXTRACT(HOUR FROM now() AT TIME ZONE 'Europe/Lisbon')::int <= 4
                )
            ) AS is_weekend_night
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
            -- Weekend-night alignment: Fri/Sat 21:00–04:00 local time
            * (CASE WHEN ch.is_weekend_night AND (
                  EXTRACT(DOW FROM r.reported_at AT TIME ZONE 'Europe/Lisbon')::int IN (5, 6)
                  AND (
                      EXTRACT(HOUR FROM r.reported_at AT TIME ZONE 'Europe/Lisbon')::int >= 21
                      OR EXTRACT(HOUR FROM r.reported_at AT TIME ZONE 'Europe/Lisbon')::int <= 4
                  )
               ) THEN 1.3 ELSE 1.0 END)
            -- Recency spike: last 2 hours
            * (CASE WHEN r.reported_at > now() - INTERVAL '2 hours' THEN 1.4 ELSE 1.0 END)
            -- Type clustering: >= 3 same-type reports within 100m over 7 days
            * (CASE WHEN tc.same_type_7d >= 3 THEN 1.2 ELSE 1.0 END)
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
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS same_type_7d
        FROM incident_reports r3
        WHERE r3.type = r.type
          AND r3.reported_at > now() - INTERVAL '7 days'
          AND ST_DWithin(r.geom::geography, r3.geom::geography, 100)
    ) tc
    WHERE r.geom && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
      AND r.reported_at > now() - INTERVAL '1 year';
$$;
