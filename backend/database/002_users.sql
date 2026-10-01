-- ─── USERS ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT,                                  -- bcrypt hash; NULL = social-only
    name          TEXT        NOT NULL,
    phone         TEXT,
    avatar_url    TEXT,
    age           SMALLINT    CHECK (age BETWEEN 1 AND 130),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─── REFRESH TOKENS ──────────────────────────────────────────────────────────
-- Stores hashed refresh tokens. Raw tokens are sent to the client only once.
-- expires_at is enforced at query time — expired rows can be cleaned up via cron.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL UNIQUE,               -- SHA-256(raw_token) hex
    expires_at TIMESTAMPTZ NOT NULL,
    revoked    BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at)
    WHERE revoked = false;                                -- partial index for cleanup job


-- ─── DEVICE PUSH TOKENS ──────────────────────────────────────────────────────
-- Expo push tokens per user per device. A user may have multiple devices.
-- ON CONFLICT DO UPDATE so re-registration refreshes the token transparently.

CREATE TABLE IF NOT EXISTS push_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE,               -- ExponentPushToken[...]
    platform   TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);
