-- 023_user_signup_location.sql
-- Capture each user's signup geographic location (city, country, IP) as observed
-- by Clerk on their first session. Populated by lib/user-sync.ts on first contact
-- and by scripts/backfill-signup-location.ts for existing users. Write-once.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_city text,
  ADD COLUMN IF NOT EXISTS signup_country text,
  ADD COLUMN IF NOT EXISTS signup_ip text,
  ADD COLUMN IF NOT EXISTS signup_captured_at timestamptz;

COMMENT ON COLUMN users.signup_city IS 'Snapshot of Clerk earliest session latest_activity.city; write-once.';
COMMENT ON COLUMN users.signup_country IS 'ISO 3166-1 alpha-2 country code from Clerk session geoIP; write-once.';
COMMENT ON COLUMN users.signup_ip IS 'IP address Clerk recorded for the earliest session; write-once.';
COMMENT ON COLUMN users.signup_captured_at IS 'Timestamp when signup geo was first written into this row.';
