-- ─── USER CREDIBILITY AUTO-ADJUSTMENT (CP-7) ─────────────────────────────────
-- Rules:
-- 1) Start at 1.0 (upsert if missing).
-- 2) If report_count >= 10 and >40% of recent non-safe reports are in zones with
--    dense safe-checkins (>=3 within 100m / 30d), reduce by 0.05 (min 0.5).
-- 3) If user has SOS events with at least one registered potential responder,
--    increase by 0.1 (max 2.0).

CREATE OR REPLACE FUNCTION fn_adjust_user_credibility(p_user_id UUID)
RETURNS NUMERIC(4,3)
LANGUAGE plpgsql
AS $$
DECLARE
    v_score            NUMERIC(4,3);
    v_report_count     INTEGER;
    v_total            INTEGER := 0;
    v_contradicted     INTEGER := 0;
    v_ratio            NUMERIC := 0;
    v_has_sos_support  BOOLEAN := FALSE;
BEGIN
    INSERT INTO user_credibility (user_id, score, report_count, updated_at)
    VALUES (p_user_id, 1.000, 0, now())
    ON CONFLICT (user_id) DO NOTHING;

    SELECT score, report_count
    INTO v_score, v_report_count
    FROM user_credibility
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF COALESCE(v_report_count, 0) >= 10 THEN
        SELECT COUNT(*)
        INTO v_total
        FROM incident_reports r
        WHERE r.user_id = p_user_id
          AND r.type NOT IN ('safe_checkin', 'sos_trigger')
          AND r.reported_at > now() - INTERVAL '180 days';

        IF v_total > 0 THEN
            SELECT COUNT(*)
            INTO v_contradicted
            FROM incident_reports r
            WHERE r.user_id = p_user_id
              AND r.type NOT IN ('safe_checkin', 'sos_trigger')
              AND r.reported_at > now() - INTERVAL '180 days'
              AND (
                SELECT COUNT(*)
                FROM incident_reports s
                WHERE s.type = 'safe_checkin'
                  AND s.reported_at > now() - INTERVAL '30 days'
                  AND ST_DWithin(r.geom::geography, s.geom::geography, 100)
              ) >= 3;

            v_ratio := v_contradicted::NUMERIC / v_total::NUMERIC;

            IF v_ratio > 0.40 THEN
                v_score := GREATEST(0.500, v_score - 0.050);
            END IF;
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM sos_events e
        JOIN circles c ON c.id = ANY(e.circle_ids)
        JOIN circle_members cm ON cm.circle_id = c.id
        WHERE e.user_id = p_user_id
          AND cm.user_id IS NOT NULL
          AND e.triggered_at > now() - INTERVAL '180 days'
    ) INTO v_has_sos_support;

    IF v_has_sos_support THEN
        v_score := LEAST(2.000, v_score + 0.100);
    END IF;

    UPDATE user_credibility
    SET score = v_score, updated_at = now()
    WHERE user_id = p_user_id;

    RETURN v_score;
END;
$$;
