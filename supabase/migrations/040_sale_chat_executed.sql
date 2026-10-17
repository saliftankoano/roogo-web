BEGIN;

-- Roogo Sell (broker model) — per-property chat where Roogo is the only counterparty.
--
-- Buyers and sellers NEVER talk to each other. Each side has its own thread with the
-- Roogo team, scoped to a single property:
--   * kind = 'seller' : the owner ↔ Roogo (listing review, price negotiation, mandate).
--                       One thread per property.
--   * kind = 'buyer'  : a buyer ↔ Roogo (interest, visits, notary meeting).
--                       One thread per buyer per property.
-- `user_id` is the non-Roogo party (owner for seller threads, buyer for buyer threads).
-- Any staff/founder is the Roogo side of every thread (no per-conversation assignment
-- is required; staff_id just records who picked it up, for display).
--
-- Messages carry a message_type so the thread can render structured cards (visit
-- requests/confirmations, mandate offers, mandate signatures, notary meetings)
-- alongside plain text. There is NO consent gate — there is no stranger to warn about.
--
-- Writes go through service-role API routes; RLS SELECT policies authorize history
-- reads AND Supabase Realtime channel subscriptions for the user and any staff/founder.

-- Private bucket for chat image attachments (clone of support-attachments).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sale-chat-attachments',
  'sale-chat-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- One thread per (property, user, kind). user_id is the owner (seller threads) or the
-- buyer (buyer threads); Roogo staff are the counterparty on every thread.
CREATE TABLE IF NOT EXISTS public.sale_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_for_user INTEGER NOT NULL DEFAULT 0,
  unread_for_staff INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_conversations_kind_check
    CHECK (kind IN ('seller', 'buyer')),
  CONSTRAINT sale_conversations_status_check
    CHECK (status IN ('open', 'resolved', 'closed')),
  CONSTRAINT sale_conversations_property_user_kind_unique
    UNIQUE (property_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_sale_conversations_user
  ON public.sale_conversations(user_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_sale_conversations_property_kind
  ON public.sale_conversations(property_id, kind);
CREATE INDEX IF NOT EXISTS idx_sale_conversations_last_message_at
  ON public.sale_conversations(last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.sale_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.sale_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  -- structured-card payload (visit slots, scheduled_at, mandate id/prices,
  -- notary meeting details, ...) and the seam for future AI moderation.
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_messages_sender_type_check
    CHECK (sender_type IN ('user', 'staff', 'system')),
  CONSTRAINT sale_messages_message_type_check
    CHECK (message_type IN (
      'text', 'visit_request', 'visit_confirmation',
      'mandate_offer', 'mandate_signed', 'notary_meeting'
    ))
);

CREATE INDEX IF NOT EXISTS idx_sale_messages_conversation
  ON public.sale_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.sale_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL
    REFERENCES public.sale_messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_message_attachments_message
  ON public.sale_message_attachments(message_id);

DROP TRIGGER IF EXISTS update_sale_conversations_updated_at
  ON public.sale_conversations;
CREATE TRIGGER update_sale_conversations_updated_at
  BEFORE UPDATE ON public.sale_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: a conversation is visible to its user OR any staff/founder. Child tables join
-- up to the conversation with the same predicate.
ALTER TABLE public.sale_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_conversations_select ON public.sale_conversations;
CREATE POLICY sale_conversations_select
  ON public.sale_conversations FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

DROP POLICY IF EXISTS sale_messages_select ON public.sale_messages;
CREATE POLICY sale_messages_select
  ON public.sale_messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.sale_conversations c
      WHERE c.user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

DROP POLICY IF EXISTS sale_message_attachments_select ON public.sale_message_attachments;
CREATE POLICY sale_message_attachments_select
  ON public.sale_message_attachments FOR SELECT
  TO authenticated
  USING (
    message_id IN (
      SELECT m.id FROM public.sale_messages m
      JOIN public.sale_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

-- Drop the old consent table (broker model has no consent gate).
DROP TABLE IF EXISTS public.sale_chat_consents;

-- Broadcast inserts/updates over Supabase Realtime so all participants update live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sale_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sale_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_conversations;
  END IF;
END $$;

COMMIT;
