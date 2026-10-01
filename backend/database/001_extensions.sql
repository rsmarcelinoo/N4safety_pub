-- Run as superuser (postgres) before any other migration.
-- Enables PostGIS spatial types + UUID generation.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- for future address search normalization
