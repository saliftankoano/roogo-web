-- Content Studio phase 5: fal.ai tools (property poster, greeting poster,
-- background removal, subtitles). Run after 080. Staff only; RLS stays on with
-- no policies, service role only.
--
--   * studio_generations: new kinds 'image' and 'transcription', a
--     'finalizing' status (one poll claims the right to save the result, so a
--     job is never saved twice), and the provider request id.
--   * studio_artifacts: new kinds 'image' and 'captions', and a meta column
--     for the prompt, model, text check result and format.
--   * reserve_studio_spend: now accepts the new kinds and counts every kind
--     toward the one monthly cap, including jobs still being finalized.
--   * content-studio bucket: allows the generated images.

ALTER TABLE public.studio_generations
  DROP CONSTRAINT IF EXISTS studio_generations_kind_check;
ALTER TABLE public.studio_generations
  ADD CONSTRAINT studio_generations_kind_check
  CHECK (kind IN ('voiceover', 'script', 'preview', 'chat', 'image', 'transcription'));

ALTER TABLE public.studio_generations
  DROP CONSTRAINT IF EXISTS studio_generations_status_check;
ALTER TABLE public.studio_generations
  ADD CONSTRAINT studio_generations_status_check
  CHECK (status IN ('running', 'finalizing', 'done', 'failed'));

ALTER TABLE public.studio_generations
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT;

ALTER TABLE public.studio_artifacts
  DROP CONSTRAINT IF EXISTS studio_artifacts_kind_check;
ALTER TABLE public.studio_artifacts
  ADD CONSTRAINT studio_artifacts_kind_check
  CHECK (kind IN ('script', 'voiceover', 'image', 'captions'));

ALTER TABLE public.studio_artifacts
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

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
  IF p_kind NOT IN ('voiceover', 'preview', 'image', 'transcription') THEN
    RAISE EXCEPTION 'unsupported spend kind %', p_kind;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('studio:' || p_user_id::text));

  SELECT COALESCE(SUM(est_cost_usd), 0)
    INTO v_used
    FROM public.studio_generations
   WHERE user_id = p_user_id
     AND kind IN ('voiceover', 'preview', 'image', 'transcription')
     AND status IN ('running', 'finalizing', 'done')
     AND created_at >= p_month_start;

  IF v_used + p_est_cost_usd > p_cap_usd THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.studio_generations
    (user_id, kind, provider, model, voice, input, est_cost_usd, status, confirmed_at)
  VALUES
    (p_user_id, p_kind,
     CASE WHEN p_kind IN ('image', 'transcription') THEN 'fal' ELSE 'cartesia' END,
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
   SET allowed_mime_types = ARRAY['audio/mpeg', 'audio/wav', 'image/png', 'image/jpeg', 'image/webp']
 WHERE id = 'content-studio';
