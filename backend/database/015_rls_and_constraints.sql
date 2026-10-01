-- ─── RLS for tables added after migration 008 ────────────────────────────────
-- incident_reports and user_credibility were created in 009_incident_reports.sql,
-- after 008_row_level_security.sql ran, so they were never covered by RLS.

-- incident_reports: users see and insert only their own reports
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incident_reports_self ON incident_reports;
CREATE POLICY incident_reports_self ON incident_reports
    USING (user_id = current_app_user_id());

DROP POLICY IF EXISTS incident_reports_insert ON incident_reports;
CREATE POLICY incident_reports_insert ON incident_reports FOR INSERT
    WITH CHECK (user_id = current_app_user_id());

-- user_credibility: users see only their own score
ALTER TABLE user_credibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_credibility_self ON user_credibility;
CREATE POLICY user_credibility_self ON user_credibility
    USING (user_id = current_app_user_id());

DROP POLICY IF EXISTS user_credibility_insert ON user_credibility;
CREATE POLICY user_credibility_insert ON user_credibility FOR INSERT
    WITH CHECK (user_id = current_app_user_id());

DROP POLICY IF EXISTS user_credibility_update ON user_credibility;
CREATE POLICY user_credibility_update ON user_credibility FOR UPDATE
    USING (user_id = current_app_user_id());


-- ─── CHECK constraint: cancelled_at must be after triggered_at ────────────────
ALTER TABLE sos_events
    DROP CONSTRAINT IF EXISTS sos_events_cancel_after_trigger;

ALTER TABLE sos_events
    ADD CONSTRAINT sos_events_cancel_after_trigger
        CHECK (cancelled_at IS NULL OR cancelled_at >= triggered_at);


-- ─── Align age validation between DB and API ──────────────────────────────────
-- API DTO accepts Range(13, 150); DB had CHECK BETWEEN 1 AND 130.
-- Lock both to 13–130 (adjust if business rule changes).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_age_check;
ALTER TABLE users ADD CONSTRAINT users_age_check CHECK (age BETWEEN 13 AND 130);
