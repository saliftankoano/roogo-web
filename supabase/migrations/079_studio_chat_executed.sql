-- Content Studio v2, phase 3: chat conversations on properties, with history
-- and pinned artifacts (scripts and voice-overs). Run after 078.
-- Staff only. RLS enabled with no policies; every access goes through the
-- service role in the /api/admin/studio routes, which scope rows to their
-- author (a founder can read everyone's).

CREATE TABLE IF NOT EXISTS public.studio_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  voice_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_studio_conversations_user_updated
  ON public.studio_conversations (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.studio_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.studio_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_messages_conversation
  ON public.studio_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.studio_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.studio_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.studio_messages(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('script', 'voiceover')),
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  generation_id UUID REFERENCES public.studio_generations(id) ON DELETE SET NULL,
  voice_key TEXT,
  output_path TEXT,
  pinned BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_artifacts_conversation
  ON public.studio_artifacts (conversation_id, created_at);

ALTER TABLE public.studio_generations
  ADD COLUMN IF NOT EXISTS conversation_id UUID
    REFERENCES public.studio_conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS property_id UUID
    REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE public.studio_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.studio_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.studio_artifacts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_conversations TO service_role;
GRANT ALL ON public.studio_messages TO service_role;
GRANT ALL ON public.studio_artifacts TO service_role;
