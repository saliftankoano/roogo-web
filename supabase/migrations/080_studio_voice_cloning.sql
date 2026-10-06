-- Content Studio v2, phase 4: voice cloning with a read-aloud consent check.
-- Run after 079. Staff only; RLS enabled with no policies, service role only.
--
--   * studio_voice_challenges: a fresh sentence and code per attempt, valid
--     for 10 minutes and usable once. The person reads it in the recording so
--     an old or someone else's clip cannot be reused.
--   * private bucket voice-consents: the recorded sample, kept as evidence.

CREATE TABLE IF NOT EXISTS public.studio_voice_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sentence TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code ~ '^[0-9]{4}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_voice_challenges_user
  ON public.studio_voice_challenges (user_id, created_at DESC);

ALTER TABLE public.studio_voice_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_voice_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_voice_challenges TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-consents',
  'voice-consents',
  FALSE,
  8388608,
  ARRAY['audio/wav', 'audio/x-wav']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
