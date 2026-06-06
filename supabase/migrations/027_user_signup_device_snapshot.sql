-- 027_user_signup_device_snapshot.sql
-- Capture each user's signup device/browser snapshot as observed by Clerk on
-- their earliest session. Populated by lib/user-sync.ts and backfill scripts.
-- Write-once.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_device_type text,
  ADD COLUMN IF NOT EXISTS signup_device_is_mobile boolean,
  ADD COLUMN IF NOT EXISTS signup_browser_name text,
  ADD COLUMN IF NOT EXISTS signup_browser_version text;

COMMENT ON COLUMN users.signup_device_type IS 'Clerk earliest session latest_activity.device_type; write-once.';
COMMENT ON COLUMN users.signup_device_is_mobile IS 'Clerk earliest session latest_activity.is_mobile; write-once.';
COMMENT ON COLUMN users.signup_browser_name IS 'Clerk earliest session latest_activity.browser_name; write-once.';
COMMENT ON COLUMN users.signup_browser_version IS 'Clerk earliest session latest_activity.browser_version; write-once.';
