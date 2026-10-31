-- 109: TikTok posting choices saved at approval (PRD « TikTok posting screen
-- for the audit », approved by Salif 2026-10-31).
--
-- When Salif approves a video that goes to TikTok in direct mode, the Studio
-- saves what he chose on the TikTok panel: privacy, comments, duets, stitches,
-- commercial content disclosure, who chose and when. The publisher sends
-- exactly these values to TikTok and nothing else.
--
-- Shape (written by lib/social/tiktok-post-settings.ts):
--   { "privacy_level": "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY",
--     "allow_comment": bool, "allow_duet": bool, "allow_stitch": bool,
--     "your_brand": bool, "branded_content": bool,
--     "creator_nickname": text, "chosen_by": uuid, "chosen_at": timestamptz }
--
-- Nullable, no default: a post without choices is never posted to TikTok in
-- direct mode. Safe to run before the code ships (nothing reads it yet).

ALTER TABLE public.studio_publications
  ADD COLUMN IF NOT EXISTS tiktok_settings JSONB;

COMMENT ON COLUMN public.studio_publications.tiktok_settings IS
  'TikTok posting choices made by the founder at approval (privacy, interactions, commercial disclosure, chosen_by, chosen_at). Migration 109.';
