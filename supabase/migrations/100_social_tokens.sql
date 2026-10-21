-- ================================================================
-- 100 Social account tokens (TikTok follower readings, 2026-10-18)
-- ================================================================
--
-- NOT EXECUTED. Run with the production Supabase login before the founder
-- clicks « Connecter TikTok » on /admin/objectifs (branch
-- fix/nav-and-goal-metrics). Until it runs, the TikTok card says the table
-- is missing and the nightly cron answers { tiktok: "not connected" }; the
-- manual TikTok reading keeps working.
--
-- Renumbered from 098 to 100 on 2026-10-20: main already has
-- 098_listing_index_checks.sql (PR #77) and 099_staff_day_reports.sql (PR #81).
--
-- One row per connected social account (only 'tiktok' for now). Written by
-- the OAuth callback app/api/admin/social/tiktok/callback (founder only) and
-- by the nightly cron /api/cron/social-followers when it refreshes tokens.
-- Tokens are encrypted by the app (AES-256-GCM, env SOCIAL_TOKENS_KEY,
-- lib/team-goals/token-crypto.ts) before they reach this table. Service role
-- only: anon and authenticated have no access at all.

BEGIN;

CREATE TABLE IF NOT EXISTS public.social_tokens (
  provider TEXT PRIMARY KEY,
  -- TikTok open_id and display name of the account that authorized (not secret).
  account_id TEXT,
  account_name TEXT,
  access_token_enc TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  scope TEXT NOT NULL DEFAULT '',
  connected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refreshed_at TIMESTAMPTZ,
  -- Last reading result, for the founder card (no token, no secret).
  last_read_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_tokens_provider_check CHECK (provider IN ('tiktok')),
  CONSTRAINT social_tokens_sealed_check
    CHECK (access_token_enc LIKE 'v1:%' AND refresh_token_enc LIKE 'v1:%')
);

ALTER TABLE public.social_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_tokens FROM anon, authenticated;
GRANT ALL ON public.social_tokens TO service_role;

COMMENT ON TABLE public.social_tokens IS
  'OAuth tokens of Roogo social accounts (TikTok). Encrypted by the app; service role only.';

COMMIT;
