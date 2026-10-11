-- Content Studio: music for videos (Salif, 2026-10-11).
-- Run after 082. Staff only; RLS stays on with no policies, service role only.
--
--   * studio_music_tracks: the team's music library. 'library' tracks are the
--     Roogo instrumentals uploaded once from the vault; 'generated' tracks are
--     made in the Studio with fal (Lyria 3 Pro) and shared with the whole team.
--   * studio_generations: new kind 'music' (provider 'fal').
--   * reserve_studio_spend: 'music' is paid from the same monthly pot as voices,
--     images and subtitles. Videos keep their own pot.

CREATE TABLE IF NOT EXISTS public.studio_music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  source TEXT NOT NULL CHECK (source IN ('library', 'generated')),
  prompt TEXT,
  duration_seconds NUMERIC(8, 2) CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  storage_path TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  generation_id UUID REFERENCES public.studio_generations(id) ON DELETE SET NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_music_tracks_listing
  ON public.studio_music_tracks (archived, source, created_at DESC);

ALTER TABLE public.studio_music_tracks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_generations
  DROP CONSTRAINT IF EXISTS studio_generations_kind_check;
ALTER TABLE public.studio_generations
  ADD CONSTRAINT studio_generations_kind_check
  CHECK (kind IN ('voiceover', 'script', 'preview', 'chat', 'image', 'transcription', 'video', 'music'));

CREATE OR REPLACE FUNCTION public.reserve_studio_spend(
  p_user_id UUID,
  p_kind TEXT,
  p_voice TEXT,
  p_model TEXT,
  p_input JSONB,
  p_est_cost_usd NUMERIC,
  p_cap_usd NUMERIC,
  p_month_start TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used NUMERIC;
  v_id UUID;
BEGIN
  IF p_kind NOT IN ('voiceover', 'preview', 'image', 'transcription', 'video', 'music') THEN
    RAISE EXCEPTION 'unsupported spend kind %', p_kind;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('studio:' || p_user_id::text));

  -- Two separate pots: videos, and everything else (voices, images, subtitles, music).
  -- p_cap_usd is the cap of the pot this kind belongs to.
  IF p_kind = 'video' THEN
    SELECT COALESCE(SUM(est_cost_usd), 0)
      INTO v_used
      FROM public.studio_generations
     WHERE user_id = p_user_id
       AND kind = 'video'
       AND status IN ('running', 'finalizing', 'done')
       AND created_at >= p_month_start;
  ELSE
    SELECT COALESCE(SUM(est_cost_usd), 0)
      INTO v_used
      FROM public.studio_generations
     WHERE user_id = p_user_id
       AND kind IN ('voiceover', 'preview', 'image', 'transcription', 'music')
       AND status IN ('running', 'finalizing', 'done')
       AND created_at >= p_month_start;
  END IF;

  IF v_used + p_est_cost_usd > p_cap_usd THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.studio_generations
    (user_id, kind, provider, model, voice, input, est_cost_usd, status, confirmed_at)
  VALUES
    (p_user_id, p_kind,
     CASE
       WHEN p_kind IN ('image', 'transcription', 'music') THEN 'fal'
       WHEN p_kind = 'video' THEN 'heygen'
       ELSE 'cartesia'
     END,
     p_model, p_voice, p_input, p_est_cost_usd, 'running', NOW())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_studio_spend(UUID, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_studio_spend(UUID, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, TIMESTAMPTZ)
  TO service_role;
