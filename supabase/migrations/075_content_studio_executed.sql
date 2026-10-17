-- Content Studio: staff voice-over and script generation ledger.
-- Staff only. RLS is enabled with no policies; every access goes through the
-- service-role client in the /api/admin/studio routes.
-- NOTE: numbers 068 to 073 are absent in this checkout. Confirm 075 is free
-- on every branch before applying.

CREATE TABLE IF NOT EXISTS public.studio_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('voiceover', 'script')),
  provider TEXT NOT NULL,
  model TEXT,
  voice TEXT CHECK (voice IS NULL OR voice IN ('sandrine', 'salif')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  est_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (est_cost_usd >= 0),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'done', 'failed')),
  output_path TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_studio_generations_user_created
  ON public.studio_generations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.studio_user_limits (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  monthly_cap_usd NUMERIC(10, 2) NOT NULL CHECK (monthly_cap_usd >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.studio_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_user_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_generations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.studio_user_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_generations TO service_role;
GRANT ALL ON public.studio_user_limits TO service_role;

-- Atomic "check the monthly cap, then reserve the spend" so a double tap or two
-- parallel requests cannot spend past the cap. Returns the new row id, or NULL
-- when the cap would be exceeded.
CREATE OR REPLACE FUNCTION public.reserve_studio_voiceover(
  p_user_id UUID,
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
  -- Serialize reservations per user for the duration of this transaction.
  PERFORM pg_advisory_xact_lock(hashtext('studio:' || p_user_id::text));

  SELECT COALESCE(SUM(est_cost_usd), 0)
    INTO v_used
    FROM public.studio_generations
   WHERE user_id = p_user_id
     AND kind = 'voiceover'
     AND status IN ('running', 'done')
     AND created_at >= p_month_start;

  IF v_used + p_est_cost_usd > p_cap_usd THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.studio_generations
    (user_id, kind, provider, model, voice, input, est_cost_usd, status, confirmed_at)
  VALUES
    (p_user_id, 'voiceover', 'cartesia', p_model, p_voice, p_input,
     p_est_cost_usd, 'running', NOW())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_studio_voiceover(UUID, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_studio_voiceover(UUID, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, TIMESTAMPTZ)
  TO service_role;

-- Private bucket for generated audio. Playback and download use signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-studio',
  'content-studio',
  FALSE,
  10485760,
  ARRAY['audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
