-- ================================================================
-- 101 Social inbox: Studio > Réseaux (2026-10-21)
-- ================================================================
--
-- NOT EXECUTED. Salif runs it after approving the PR (branch
-- feat/studio-reseaux). Until it runs, Studio > Réseaux shows the notice
-- « migration 101 à lancer », the badges stay at zero, the 10-minute cron
-- answers { ready: false } and every write answers 503. Nothing crashes.
--
-- Numbering: main has 098 and 099; open PR #78 uses 100 (social_tokens).
--
-- What it stores:
--   * social_inbox_items: one row per comment (Facebook Page posts, Instagram
--     media) and one row per direct conversation (Instagram DMs, Facebook
--     Messenger), read from the Meta Graph API every 10 minutes by
--     /api/cron/social-inbox and on « Actualiser ». The team's status
--     (à répondre, répondu, ignoré), who replied and when.
--   * social_inbox_replies: every reply sent from the dashboard, with the staff
--     member who sent it, the text, Meta's id or the error. Never deleted by
--     the app: it is the log of what was said in Roogo's name.
--   * social_inbox_sync: last read per source, so each card can say what
--     failed (missing permission, expired token, rate limit) and « Actualiser »
--     can be rate limited.
--
-- Access follows 089/099: RLS on, no policies, anon and authenticated
-- revoked, every read and write through the service role in
-- /api/admin/social/inbox*, which checks the caller's level (social.inbox).
-- No token or secret is ever stored here.

BEGIN;

CREATE TABLE IF NOT EXISTS public.social_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network TEXT NOT NULL CHECK (network IN ('facebook', 'instagram', 'tiktok')),
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'message')),
  -- Comment id, or conversation id for a message thread.
  external_id TEXT NOT NULL,
  -- Comments: the post or media id. Messages: null.
  parent_external_id TEXT,
  -- The person on the other side (PSID / IGSID / commenter id), when Meta gives it.
  author_id TEXT,
  author_name TEXT,
  author_username TEXT,
  -- Comment text, or the last message the person sent.
  text TEXT NOT NULL DEFAULT '' CHECK (char_length(text) <= 8000),
  -- When the comment was written, or the time of the last message of the thread.
  remote_created_at TIMESTAMPTZ NOT NULL,
  -- Messages: the last message from the person (Meta's 24-hour window starts here).
  last_user_message_at TIMESTAMPTZ,
  -- The post or video the comment is on (caption cut short, thumbnail URL from Meta).
  post_caption TEXT,
  post_permalink TEXT,
  post_thumbnail TEXT,
  -- Link to open the comment or the conversation on the network.
  permalink TEXT,
  -- VEN-/LOC- code found in the post caption or the text, and the listing it points to.
  listing_reference TEXT CHECK (listing_reference IS NULL OR listing_reference ~ '^(VEN|LOC)-[0-9]{3,}$'),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  -- Messages: the last messages of the thread, oldest first
  -- [{ "id", "fromUs", "text", "at" }], at most 20.
  messages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(messages) = 'array'),

  status TEXT NOT NULL DEFAULT 'a_repondre' CHECK (status IN ('a_repondre', 'repondu', 'ignore')),
  status_changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status_changed_at TIMESTAMPTZ,
  -- Last reply: from the dashboard (replied_by set) or seen on the network
  -- (replied_externally, someone answered in the Meta apps).
  replied_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  replied_at TIMESTAMPTZ,
  replied_externally BOOLEAN NOT NULL DEFAULT FALSE,

  -- Meta's object as read (no token), for debugging a parsing change.
  raw JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT social_inbox_items_unique_external UNIQUE (network, kind, external_id)
);

-- The two lists (Commentaires, Messages), newest first, filtered by status.
CREATE INDEX IF NOT EXISTS idx_social_inbox_items_kind_status
  ON public.social_inbox_items (kind, status, remote_created_at DESC);
-- The badges: how many « À répondre ».
CREATE INDEX IF NOT EXISTS idx_social_inbox_items_waiting
  ON public.social_inbox_items (kind)
  WHERE status = 'a_repondre';

DROP TRIGGER IF EXISTS update_social_inbox_items_updated_at ON public.social_inbox_items;
CREATE TRIGGER update_social_inbox_items_updated_at
  BEFORE UPDATE ON public.social_inbox_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.social_inbox_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.social_inbox_items(id) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('facebook', 'instagram', 'tiktok')),
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'message')),
  -- The staff member who pressed « Envoyer ». The reply goes out as the Roogo Page/account.
  staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2200),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  -- Meta's id of the reply comment or message, when sent.
  external_id TEXT,
  -- French error shown to the team, when failed (never a token or a URL).
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_inbox_replies_item
  ON public.social_inbox_replies (item_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS public.social_inbox_sync (
  source TEXT PRIMARY KEY CHECK (source IN ('facebook_comments', 'instagram_comments', 'facebook_messages', 'instagram_messages')),
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  -- French, shown on the source's card. Null when the last read worked.
  last_error TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.social_inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_inbox_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_inbox_sync ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.social_inbox_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.social_inbox_replies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.social_inbox_sync FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.social_inbox_items TO service_role;
GRANT ALL ON public.social_inbox_replies TO service_role;
GRANT ALL ON public.social_inbox_sync TO service_role;

COMMENT ON TABLE public.social_inbox_items IS
  'Studio > Réseaux: Facebook/Instagram comments and direct conversations read from Meta, with the team status. Service role only.';
COMMENT ON TABLE public.social_inbox_replies IS
  'Every reply sent from Studio > Réseaux, with the staff member who sent it. Service role only.';
COMMENT ON TABLE public.social_inbox_sync IS
  'Last Meta read per inbox source (errors shown per card, Actualiser rate limit). Service role only.';

COMMIT;
