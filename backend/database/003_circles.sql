-- ─── CIRCLES ─────────────────────────────────────────────────────────────────
-- A circle is a named group of contacts owned by one user.
-- Alert flags are per-circle so each circle can have a different response policy.
-- Example: "Parents" → SOS + SMS only; "Friends" → SOS + push + emergency services.

CREATE TABLE IF NOT EXISTS circles (
    id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name                      TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    is_active                 BOOLEAN     NOT NULL DEFAULT false,

    -- Per-circle alert policy (mirrors mobile AlertSettings type)
    alert_sos                 BOOLEAN     NOT NULL DEFAULT true,
    alert_notification        BOOLEAN     NOT NULL DEFAULT true,
    alert_emergency_services  BOOLEAN     NOT NULL DEFAULT false,

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circles_owner ON circles (owner_id);

CREATE OR REPLACE TRIGGER trg_circles_updated_at
    BEFORE UPDATE ON circles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─── CIRCLE MEMBERS ──────────────────────────────────────────────────────────
-- Contacts stored inside a circle.
-- user_id is nullable: NULL means the contact is not a registered N4Safety user.
-- Non-registered contacts receive SMS only (Twilio). Registered ones also get push.
-- phone is the dedup key — the same phone can only appear once per circle.

CREATE TABLE IF NOT EXISTS circle_members (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    circle_id  UUID        NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    user_id    UUID        REFERENCES users (id) ON DELETE SET NULL,  -- NULL = not registered
    name       TEXT        NOT NULL,
    phone      TEXT        NOT NULL,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (circle_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_circle  ON circle_members (circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_user    ON circle_members (user_id)
    WHERE user_id IS NOT NULL;
-- Index to quickly find all circles a given phone number is a member of
CREATE INDEX IF NOT EXISTS idx_circle_members_phone   ON circle_members (phone);


-- ─── CIRCLE MEMBERSHIPS VIEW ─────────────────────────────────────────────────
-- Convenience view: circles the authenticated user is a *member of* (not owner).
-- The app fetches this to show "circles you've been added to".
-- Usage: SELECT * FROM v_circle_memberships WHERE member_user_id = $1;

CREATE OR REPLACE VIEW v_circle_memberships AS
    SELECT
        cm.user_id   AS member_user_id,
        c.id         AS circle_id,
        c.name       AS circle_name,
        u.name       AS owner_name,
        c.owner_id,
        c.is_active,
        c.alert_sos,
        c.alert_notification,
        c.alert_emergency_services,
        cm.added_at
    FROM circle_members cm
    JOIN circles c ON c.id = cm.circle_id
    JOIN users   u ON u.id = c.owner_id
    WHERE cm.user_id IS NOT NULL;
