-- ─── HEATMAP SCORING FUNCTION ─────────────────────────────────────────────────
-- fn_heatmap_points_in_bbox
--
-- Returns weighted incident points for the MapLibre heatmap layer.
-- Each row is one original report with a computed weight 0.0–1.0.
--
-- Scoring formula per point:
--   weight = MIN(1.0,
--     base_points
--     × credibility_score             (user_credibility.score, default 1.0)
--     × time_decay                    (0.04 + 0.96 × e^(-0.05 × age_days))
--     × frequency_bonus               (1 + LN(1 + nearby_30d_count) / 4)
--     / 100.0                         (normalise: 100 pts = 1.0 at full freshness)
--   )
--
-- Time-decay floor: 0.04 (4%) — weight never reaches zero.
-- Decay half-life:  ≈14 days. After 1 year: ≈4% (floor).
-- Frequency bonus:  logarithmic — 5 nearby reports adds ×1.45, 20 adds ×1.76.
-- Normalization:    a fresh assault (90 pts × 1.0 cred) → weight 0.90.
--                   a fresh SOS    (150 pts × 1.0 cred) → capped at 1.0.
--
-- Lookback window: 1 year. Older reports drop below floor and are ignored.
-- Nearby radius for frequency bonus: 150 m.

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
    SELECT
        r.lat,
        r.lng,
        LEAST(1.0, (
            r.base_points::float
            * COALESCE(uc.score, 1.0)
            * (0.04 + 0.96 * EXP(
                -0.05 * EXTRACT(epoch FROM (now() - r.reported_at)) / 86400.0
              ))
            * (1.0 + LN(1.0 + nc.nearby_30d::float) / 4.0)
        ) / 100.0) AS weight
    FROM incident_reports r
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
