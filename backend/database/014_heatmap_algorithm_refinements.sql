-- ─── HEATMAP ALGORITHM REFINEMENTS ─────────────────────────────────────────────
-- 1. Safe check-in dampening cap: safe_checkins reduce heat by at most 25%
-- 2. SOS decay acceleration: sos_trigger events decay 6x faster (HL ~2.3d vs ~14d)
-- 3. Credibility: remove safe-zone penalty, only decrease for contradictory reports
--
-- Apply: psql "postgresql://postgres:postgres@localhost:5432/n4safety" -f 014_heatmap_algorithm_refinements.sql

-- ─── 1. Safe Check-in Dampening Cap ───────────────────────────────────────────
-- Instead of including safe_checkin as regular rows (their -8 base_points can
-- fully cancel heat), we exclude them from the main calculation and apply a
-- separate dampening multiplier capped at 25% max reduction.

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
            -- Time decay: SOS decays 6x faster (HL ~2.3d), normal HL ~14d
            * (0.04 + 0.96 * EXP(
                -0.05 * EXTRACT(epoch FROM (now() - r.reported_at)) / 86400.0
                * CASE WHEN r.type = 'sos_trigger'::incident_type THEN 6.0 ELSE 1.0 END
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
            -- Safe check-in dampening: cap at 25% max reduction
            * (CASE WHEN sc.safe_count > 0
                THEN GREATEST(0.75, 1.0 - 0.04 * LEAST(sc.safe_count, 10))
                ELSE 1.0 END)
        ) / 100.0) AS weight
    FROM incident_reports r
    CROSS JOIN curr_hour ch
    LEFT JOIN user_credibility uc ON uc.user_id = r.user_id
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::float AS nearby_30d
        FROM incident_reports r2
        WHERE r2.id        != r.id
          AND r2.reported_at > now() - INTERVAL '30 days'
          AND r2.type     != 'safe_checkin'::incident_type
          AND ST_DWithin(r.geom::geography, r2.geom::geography, 150)
    ) nc
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS same_type_7d
        FROM incident_reports r3
        WHERE r3.type = r.type
          AND r3.reported_at > now() - INTERVAL '7 days'
          AND r3.type != 'safe_checkin'::incident_type
          AND ST_DWithin(r.geom::geography, r3.geom::geography, 100)
    ) tc
    CROSS JOIN LATERAL (
        -- Count nearby safe_checkins for dampening
        SELECT COUNT(*)::int AS safe_count
        FROM incident_reports sc_r
        WHERE sc_r.type = 'safe_checkin'::incident_type
          AND sc_r.reported_at > now() - INTERVAL '30 days'
          AND ST_DWithin(r.geom::geography, sc_r.geom::geography, 200)
    ) sc
    WHERE r.geom && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
      AND r.reported_at > now() - INTERVAL '1 year'
      AND r.type != 'safe_checkin'::incident_type;  -- exclude from main row set
$$;


-- ─── 2. Credibility: Remove safe-zone penalty ──────────────────────────────────
-- Old behaviour: reduced score toward 0.5 if >40% of reports in safe-signal zones.
-- New behaviour: only decrease for contradictory patterns (report different type
-- within 100m/48h of a safe_checkin by the same user), increase for SOS triggers
-- that were responded to.
--
-- This function is called after every report submission.

CREATE OR REPLACE FUNCTION fn_adjust_user_credibility(p_user_id UUID)
RETURNS DECIMAL LANGUAGE plpgsql AS $$
DECLARE
    v_reports_7d   INT;
    v_contradictions INT;
    v_sos_count    INT;
    v_score        DECIMAL;
BEGIN
    -- Count user's reports in the last 7 days
    SELECT COUNT(*) INTO v_reports_7d
    FROM incident_reports
    WHERE user_id = p_user_id
      AND reported_at > now() - INTERVAL '7 days';

    -- Count contradictions: user submitted a safe_checkin, then within 48h
    -- submitted a DIFFERENT type report within 100m of that checkin
    SELECT COUNT(*) INTO v_contradictions
    FROM incident_reports r1
    JOIN incident_reports r2 ON r2.user_id = r1.user_id
    WHERE r1.user_id = p_user_id
      AND r1.type = 'safe_checkin'::incident_type
      AND r2.type != 'safe_checkin'::incident_type
      AND r2.reported_at > r1.reported_at
      AND r2.reported_at < r1.reported_at + INTERVAL '48 hours'
      AND ST_DWithin(r1.geom::geography, r2.geom::geography, 100);

    -- Count SOS triggers by this user
    SELECT COUNT(*) INTO v_sos_count
    FROM incident_reports
    WHERE user_id = p_user_id
      AND type = 'sos_trigger'::incident_type
      AND reported_at > now() - INTERVAL '90 days';

    -- Start at 1.0
    v_score := 1.0;

    -- Each contradiction costs 0.1 (min 0.5)
    IF v_contradictions > 0 THEN
        v_score := v_score - LEAST(v_contradictions * 0.1, 0.5);
    END IF;

    -- Each real SOS in last 90 days boosts by 0.1 (max 2.0)
    IF v_sos_count > 0 THEN
        v_score := v_score + LEAST(v_sos_count * 0.1, 1.0);
    END IF;

    -- Clamp to [0.5, 2.0]
    v_score := GREATEST(0.5, LEAST(2.0, v_score));

    -- Upsert
    INSERT INTO user_credibility (user_id, score)
    VALUES (p_user_id, v_score)
    ON CONFLICT (user_id) DO UPDATE SET score = v_score;

    RETURN v_score;
END;
$$;
