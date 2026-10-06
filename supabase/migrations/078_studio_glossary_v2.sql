-- Content Studio v2, phase 2: glossary previews and editing.
--   * Glossary entries can be edited by their author (or a founder), so they
--     get an updated_at timestamp.
--   * A glossary "Listen" preview costs a fraction of a cent and counts toward
--     the same monthly cap as a voice-over, so the ledger accepts the kinds
--     'preview' and 'chat' and the reserve function becomes kind-aware.
-- Run after 077. The old reserve_studio_voiceover function is left in place.

ALTER TABLE public.studio_glossary
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.studio_generations
  DROP CONSTRAINT IF EXISTS studio_generations_kind_check;
ALTER TABLE public.studio_generations
  ADD CONSTRAINT studio_generations_kind_check
  CHECK (kind IN ('voiceover', 'script', 'preview', 'chat'));

-- Check the monthly cap and reserve the spend in one step, per person.
-- Voice-overs and previews are summed together. Returns the new row id, or
-- NULL when the spend would pass the cap.
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
  IF p_kind NOT IN ('voiceover', 'preview') THEN
    RAISE EXCEPTION 'unsupported spend kind %', p_kind;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('studio:' || p_user_id::text));

  SELECT COALESCE(SUM(est_cost_usd), 0)
    INTO v_used
    FROM public.studio_generations
   WHERE user_id = p_user_id
     AND kind IN ('voiceover', 'preview')
     AND status IN ('running', 'done')
     AND created_at >= p_month_start;

  IF v_used + p_est_cost_usd > p_cap_usd THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.studio_generations
    (user_id, kind, provider, model, voice, input, est_cost_usd, status, confirmed_at)
  VALUES
    (p_user_id, p_kind, 'cartesia', p_model, p_voice, p_input,
     p_est_cost_usd, 'running', NOW())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_studio_spend(UUID, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_studio_spend(UUID, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, TIMESTAMPTZ)
  TO service_role;
