-- ─── ROW-LEVEL SECURITY ──────────────────────────────────────────────────────
-- RLS ensures queries from the app server only ever return rows that belong
-- to the authenticated user. The API sets `app.current_user_id` on each
-- connection/transaction before executing queries.
--
-- In ASP.NET Core, set this via Npgsql before every query:
--   await conn.ExecuteAsync("SET app.current_user_id = @id", new { id = userId });
--
-- NOTE: RLS is applied at the DB level as a defence-in-depth measure.
-- The application layer still enforces ownership in its WHERE clauses.


-- Enable RLS on all user-scoped tables (idempotent)
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE circles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_location_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens      ENABLE ROW LEVEL SECURITY;


-- Helper function: returns the current session user UUID
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.current_user_id', true), '')::UUID;
$$;


-- ─── Policies (drop-then-create for idempotency) ──────────────────────────────

-- users: can only see/edit your own row
DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users
    USING (id = current_app_user_id());

-- circles: owner can see/edit their circles
DROP POLICY IF EXISTS circles_owner ON circles;
CREATE POLICY circles_owner ON circles
    USING (owner_id = current_app_user_id());

-- circles: members can read circles they belong to
DROP POLICY IF EXISTS circles_member_read ON circles;
CREATE POLICY circles_member_read ON circles AS PERMISSIVE FOR SELECT
    USING (
        id IN (
            SELECT circle_id FROM circle_members
            WHERE user_id = current_app_user_id()
        )
    );

-- circle_members: owner of the parent circle can read/write
DROP POLICY IF EXISTS circle_members_owner ON circle_members;
CREATE POLICY circle_members_owner ON circle_members
    USING (
        circle_id IN (
            SELECT id FROM circles WHERE owner_id = current_app_user_id()
        )
    );

-- circle_members: members can read their own entry
DROP POLICY IF EXISTS circle_members_self_read ON circle_members;
CREATE POLICY circle_members_self_read ON circle_members AS PERMISSIVE FOR SELECT
    USING (user_id = current_app_user_id());

-- push_tokens: own rows only
DROP POLICY IF EXISTS push_tokens_self ON push_tokens;
CREATE POLICY push_tokens_self ON push_tokens
    USING (user_id = current_app_user_id());

-- sos_events: owner can see all their events
DROP POLICY IF EXISTS sos_events_owner ON sos_events;
CREATE POLICY sos_events_owner ON sos_events
    USING (user_id = current_app_user_id());

-- sos_location_stream: stream owner only
DROP POLICY IF EXISTS sos_stream_owner ON sos_location_stream;
CREATE POLICY sos_stream_owner ON sos_location_stream
    USING (
        event_id IN (SELECT id FROM sos_events WHERE user_id = current_app_user_id())
    );

-- saved_locations: own rows only
DROP POLICY IF EXISTS saved_locations_self ON saved_locations;
CREATE POLICY saved_locations_self ON saved_locations
    USING (user_id = current_app_user_id());

-- refresh_tokens: own rows only
DROP POLICY IF EXISTS refresh_tokens_self ON refresh_tokens;
CREATE POLICY refresh_tokens_self ON refresh_tokens
    USING (user_id = current_app_user_id());


-- danger_zones: public read — no user filter needed
-- (RLS is NOT enabled on danger_zones; it's admin-managed public data)
