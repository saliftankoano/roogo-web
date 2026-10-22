-- Content Studio: property videos rendered in the HeyGen cloud (HyperFrames).
-- Run after 081. Staff only; RLS stays on with no policies, service role only.
--
--   * studio_generations: new kind 'video' (provider 'heygen').
--   * studio_artifacts: new kind 'video' (the rendered MP4, kept in our bucket).
--   * Videos have their own monthly budget, separate from voices and images
--     (Salif, 2026-10-10): studio_user_limits.monthly_video_cap_usd, and
--     reserve_studio_spend counts 'video' only against videos and the other
--     paid kinds only against each other.
--   * content-studio bucket: allows MP4 and raises the size limit to 100 MB
--     (a 40 s 1080x1920 render is about 25 to 35 MB).

ALTER TABLE public.studio_generations
  DROP CONSTRAINT IF EXISTS studio_generations_kind_check;
ALTER TABLE public.studio_generations
  ADD CONSTRAINT studio_generations_kind_check
  CHECK (kind IN ('voiceover', 'script', 'preview', 'chat', 'image', 'transcription', 'video'));

ALTER TABLE public.studio_artifacts
  DROP CONSTRAINT IF EXISTS studio_artifacts_kind_check;
ALTER TABLE public.studio_artifacts
  ADD CONSTRAINT studio_artifacts_kind_check
  CHECK (kind IN ('script', 'voiceover', 'image', 'captions', 'video'));

ALTER TABLE public.studio_user_limits
  ADD COLUMN IF NOT EXISTS monthly_video_cap_usd NUMERIC(10, 2)
  CHECK (monthly_video_cap_usd IS NULL OR monthly_video_cap_usd >= 0);

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
  IF p_kind NOT IN ('voiceover', 'preview', 'image', 'transcription', 'video') THEN
    RAISE EXCEPTION 'unsupported spend kind %', p_kind;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('studio:' || p_user_id::text));

  -- Two separate pots: videos, and everything else (voices, images, subtitles).
  -- p_cap_usd is the cap of the pot this kind belongs to.
  SELECT COALESCE(SUM(est_cost_usd), 0)
    INTO v_used
    FROM public.studio_generations
   WHERE user_id = p_user_id
     AND kind IN (CASE WHEN p_kind = 'video' THEN 'video' ELSE 'voiceover' END,
                  CASE WHEN p_kind = 'video' THEN 'video' ELSE 'preview' END,
                  CASE WHEN p_kind = 'video' THEN 'video' ELSE 'image' END,
                  CASE WHEN p_kind = 'video' THEN 'video' ELSE 'transcription' END)
     AND status IN ('running', 'finalizing', 'done')
     AND created_at >= p_month_start;

  IF v_used + p_est_cost_usd > p_cap_usd THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.studio_generations
    (user_id, kind, provider, model, voice, input, est_cost_usd, status, confirmed_at)
  VALUES
    (p_user_id, p_kind,
     CASE
       WHEN p_kind IN ('image', 'transcription') THEN 'fal'
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

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['audio/mpeg', 'audio/wav', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4'],
       file_size_limit = 104857600
 WHERE id = 'content-studio';
