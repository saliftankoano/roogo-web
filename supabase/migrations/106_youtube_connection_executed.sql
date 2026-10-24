-- ================================================================
-- 106 YouTube connection and the « Abonnés YouTube » goal (2026-10-23)
-- ================================================================
--
-- NOT EXECUTED. Salif runs it after approving the PR (branch
-- feat/youtube-connexion), with the production Supabase login.
--
-- Depends on 100_social_tokens.sql (table social_tokens) and on
-- 091_team_goals_executed.sql / 093_property_sold_state_executed.sql
-- (team_goals, team_goal_readings with its source column). If 100 has not
-- run yet, run 100 first: this file skips the social_tokens part when the
-- table is missing, and 100 run afterwards would bring back its
-- tiktok-only check.
--
-- Numbering: main ends at 104; 102 is the studio carousels branch and 105 is
-- the parallel feat/publier-partout branch (105_studio_publish_everywhere.sql).
--
-- What it changes (no data is written, no row is deleted):
--   1. social_tokens.provider accepts 'youtube' next to 'tiktok'. The row is
--      written by the founder's « Connecter YouTube » callback
--      (app/api/admin/social/youtube/callback) and refreshed by
--      getFreshYouTubeAccess (lib/team-goals/youtube-store.ts). Tokens stay
--      sealed by the app with SOCIAL_TOKENS_KEY (AES-256-GCM, « v1:... »).
--   2. team_goals.metric and team_goal_readings.metric accept
--      'youtube_subscribers' (« Abonnés YouTube »). The goal itself is NOT
--      created here: the founder creates « 500 abonnés YouTube » in the app
--      once this has run.
--
-- The metric checks of 091 were written inline, so Postgres named them
-- team_goals_metric_check and team_goal_readings_metric_check. To be safe
-- with any name, every CHECK constraint on those columns that mentions
-- 'tiktok_followers' is dropped before the new one is added.
--
-- Safe to run twice. Safe for every app version: older code never writes
-- the new values.

BEGIN;

-- 1. social_tokens: provider 'youtube'.
DO $$
BEGIN
  IF to_regclass('public.social_tokens') IS NULL THEN
    RAISE NOTICE 'social_tokens is missing: run 100_social_tokens.sql first, then this file again.';
  ELSE
    ALTER TABLE public.social_tokens DROP CONSTRAINT IF EXISTS social_tokens_provider_check;
    ALTER TABLE public.social_tokens
      ADD CONSTRAINT social_tokens_provider_check CHECK (provider IN ('tiktok', 'youtube'));
    COMMENT ON TABLE public.social_tokens IS
      'OAuth tokens of Roogo social accounts (TikTok, YouTube). Encrypted by the app; service role only.';
  END IF;
END
$$;

-- 2. team_goals.metric and team_goal_readings.metric: 'youtube_subscribers'.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname IN ('team_goals', 'team_goal_readings')
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%tiktok_followers%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.relname, c.conname);
  END LOOP;
END
$$;

ALTER TABLE public.team_goals
  ADD CONSTRAINT team_goals_metric_check CHECK (metric IN (
    'users',
    'properties_under_contract',
    'properties_sold',
    'properties_listed_in_period',
    'tiktok_followers',
    'facebook_followers',
    'instagram_followers',
    'youtube_subscribers'
  ));

ALTER TABLE public.team_goal_readings
  ADD CONSTRAINT team_goal_readings_metric_check CHECK (metric IN (
    'tiktok_followers',
    'facebook_followers',
    'instagram_followers',
    'youtube_subscribers'
  ));

COMMIT;
