-- ─── SAFE CHECK-IN TYPE + CREDIBILITY FUNCTION ───────────────────────────────
-- This migration:
--   1. Adds 'safe_checkin' to the incident_type enum so the SafeCheckin
--      endpoint can insert negative-weight rows without a DB error.
--   2. Creates fn_adjust_user_credibility() — called after every safe check-in
--      to recalibrate how much weight that user's reports carry in the heatmap.
--
-- Credibility logic:
--   After a user accumulates ≥5 non-safe reports in 90 days we look at what
--   fraction of those reports fall inside areas that OTHER users recently
--   checked in as safe (within 150m, last 30 days).
--
--   >60% in safe areas → score 0.60 (likely low-quality reports)
--   40-60% in safe areas → score 0.80
--   <10% in safe areas → score 1.20 (consistently reports in genuinely risky spots)
--   Otherwise → score 1.00 (neutral)
--
--   Score is clamped to [0.5, 2.0] and written to user_credibility on every call.
--   The function is STABLE within a session — cheap enough to call per check-in.

-- 1. Add safe_checkin enum value (idempotent)
ALTER TYPE incident_type ADD VALUE IF NOT EXISTS 'safe_checkin';

-- 2. Credibility recalculation function
CREATE OR REPLACE FUNCTION fn_adjust_user_credibility(p_user_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
    v_report_count INTEGER;
    v_safe_ratio   NUMERIC;
    v_new_score    NUMERIC;
BEGIN
    -- Count non-safe reports in last 90 days
    SELECT COUNT(*) INTO v_report_count
    FROM incident_reports
    WHERE user_id    = p_user_id
      AND type       != 'safe_checkin'
      AND type       != 'sos_trigger'
      AND reported_at > now() - INTERVAL '90 days';

    -- Not enough data yet — keep default score
    IF v_report_count < 5 THEN
        INSERT INTO user_credibility (user_id, score, report_count, updated_at)
        VALUES (p_user_id, 1.000, v_report_count, now())
        ON CONFLICT (user_id) DO UPDATE
        SET report_count = v_report_count, updated_at = now();
        RETURN 1.0;
    END IF;

    -- What fraction of the user's reports land in areas that others recently
    -- marked safe? A high fraction means the user reports in safe zones → lower trust.
    SELECT COALESCE(
        COUNT(*)::numeric / NULLIF(v_report_count, 0),
        0
    ) INTO v_safe_ratio
    FROM incident_reports ir
    WHERE ir.user_id     = p_user_id
      AND ir.type       != 'safe_checkin'
      AND ir.type       != 'sos_trigger'
      AND ir.reported_at > now() - INTERVAL '90 days'
      AND EXISTS (
          SELECT 1
          FROM incident_reports sc
          WHERE sc.type        = 'safe_checkin'
            AND sc.user_id    != p_user_id
            AND sc.reported_at > now() - INTERVAL '30 days'
            AND ST_DWithin(ir.geom::geography, sc.geom::geography, 150)
      );

    v_new_score := CASE
        WHEN v_safe_ratio > 0.60 THEN 0.60   -- mostly reporting in safe zones
        WHEN v_safe_ratio > 0.40 THEN 0.80   -- often reporting in safe zones
        WHEN v_safe_ratio < 0.10 THEN 1.20   -- consistently reporting real danger
        ELSE                          1.00
    END;

    -- Clamp to valid range
    v_new_score := GREATEST(0.5, LEAST(2.0, v_new_score));

    INSERT INTO user_credibility (user_id, score, report_count, updated_at)
    VALUES (p_user_id, v_new_score, v_report_count, now())
    ON CONFLICT (user_id) DO UPDATE
    SET score        = v_new_score,
        report_count = v_report_count,
        updated_at   = now();

    RETURN v_new_score;
END;
$$;
