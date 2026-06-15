BEGIN;

-- In-app support chat (ROO-10). A logged-in user has ONE ongoing conversation
-- with Roogo; staff/founder users reply from the admin panel. Writes are mediated
-- by service-role API routes; reads (history + Supabase Realtime) are gated by the
-- SELECT policies below using the caller's Clerk JWT (auth.jwt() ->> 'sub').

-- Private bucket for chat screenshots. Access via short-lived signed URLs from
-- service-role API routes (mirrors identity-documents in migration 025).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- One conversation per user (single ongoing thread).
CREATE TABLE IF NOT EXISTS public.support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to_staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_for_staff INTEGER NOT NULL DEFAULT 0,
  unread_for_user INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_conversations_status_check
    CHECK (status IN ('open', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_last_message_at
  ON public.support_conversations(last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_messages_sender_type_check
    CHECK (sender_type IN ('user', 'staff'))
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
  ON public.support_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.support_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL
    REFERENCES public.support_messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_message_attachments_message
  ON public.support_message_attachments(message_id);

DROP TRIGGER IF EXISTS update_support_conversations_updated_at
  ON public.support_conversations;
CREATE TRIGGER update_support_conversations_updated_at
  BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: writes happen via service-role API routes (no INSERT/UPDATE/DELETE policies
-- for authenticated). SELECT policies let the user read their own thread and staff
-- read everything, which is what Supabase Realtime authorizes against.
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_message_attachments ENABLE ROW LEVEL SECURITY;

-- Helper predicates reused below:
--   is the caller staff/founder?
--   does the caller own conversation X?

DROP POLICY IF EXISTS support_conversations_select ON public.support_conversations;
CREATE POLICY support_conversations_select
  ON public.support_conversations FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select
  ON public.support_messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.support_conversations
      WHERE user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

DROP POLICY IF EXISTS support_message_attachments_select ON public.support_message_attachments;
CREATE POLICY support_message_attachments_select
  ON public.support_message_attachments FOR SELECT
  TO authenticated
  USING (
    message_id IN (
      SELECT m.id FROM public.support_messages m
      JOIN public.support_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

-- Broadcast inserts/updates over Supabase Realtime so both sides update live.
-- Idempotent: only add tables not already members of the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
  END IF;
END $$;

COMMIT;
