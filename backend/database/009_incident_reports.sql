-- ─── INCIDENT REPORTS ────────────────────────────────────────────────────────
-- Crowd-sourced safety reports that power the live risk heatmap.
-- Submitted by users via the "Report Unsafe Spot" button on the SOS screen.
-- SOS triggers also auto-insert a 'sos_trigger' row here.
--
-- Design decisions:
-- • base_points stored at insert time (immutable) so score changes don't
--   retroactively alter old reports if weights are tuned later.
-- • geom is explicit (not GENERATED) so insert can pass the point directly.
-- • No hard delete policy — reports expire from the heatmap via time-decay
--   in the scoring function (reports > 1 year have negligible weight ≈ 4%).

DO $$ BEGIN
    CREATE TYPE incident_type AS ENUM (
        'poor_lighting',
        'suspicious_person',
        'harassment',
        'theft',
        'assault',
        'fight',
        'sos_trigger'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS incident_reports (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type        incident_type NOT NULL,
    base_points SMALLINT    NOT NULL,   -- immutable risk weight set at insert
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    geom        GEOMETRY(Point, 4326) NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_geom ON incident_reports USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_incident_reports_time ON incident_reports (reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_user ON incident_reports (user_id);

-- ─── USER CREDIBILITY ─────────────────────────────────────────────────────────
-- Per-user trust score applied as a multiplier in the heatmap scoring formula.
-- Default 1.0, range 0.5–2.0. Updated by Copilot credibility job (CP-7).
-- Upserted by ReportsController on each new report submission.

CREATE TABLE IF NOT EXISTS user_credibility (
    user_id      UUID        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    score        NUMERIC(4,3) NOT NULL DEFAULT 1.000,
    report_count INTEGER      NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
