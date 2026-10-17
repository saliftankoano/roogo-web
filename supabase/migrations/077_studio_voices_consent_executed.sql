-- Content Studio v2, phase 1: team voices, consent records and revocation.
-- Staff only. RLS enabled with no policies; every access goes through the
-- service role in the /api/admin/studio routes.
--
-- Rules enforced here, not only in the app:
--   * One voice per person: a person who owns a voice that is not revoked
--     cannot own another (partial unique index). To change a voice the
--     current one must be revoked first.
--   * A locked voice (not yet accepted by its owner) cannot be used.
--   * Accepting and revoking are atomic functions.

CREATE TABLE IF NOT EXISTS public.studio_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9-]{2,40}$'),
  label TEXT NOT NULL,
  description TEXT,
  cartesia_voice_id TEXT NOT NULL,
  -- system: a voice that already existed in the Cartesia account.
  -- cloned: created from a staff recording by the Studio (phase 4).
  kind TEXT NOT NULL CHECK (kind IN ('system', 'cloned')),
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'locked'
    CHECK (status IN ('active', 'locked', 'pending', 'revoked')),
  consent_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoke_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_voices_one_per_owner
  ON public.studio_voices (owner_user_id)
  WHERE owner_user_id IS NOT NULL AND status <> 'revoked';

CREATE TABLE IF NOT EXISTS public.studio_voice_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id UUID NOT NULL REFERENCES public.studio_voices(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  terms_version TEXT NOT NULL,
  terms_text_hash TEXT,
  method TEXT NOT NULL
    CHECK (method IN ('read_aloud', 'account_acceptance', 'founder_attested')),
  challenge_sentence TEXT,
  challenge_transcript TEXT,
  match_score NUMERIC(4, 3),
  sample_sha256 TEXT,
  sample_path TEXT,
  ip TEXT,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  cartesia_deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_studio_voice_consents_voice
  ON public.studio_voice_consents (voice_id);

ALTER TABLE public.studio_voices
  DROP CONSTRAINT IF EXISTS studio_voices_consent_fk;
ALTER TABLE public.studio_voices
  ADD CONSTRAINT studio_voices_consent_fk
  FOREIGN KEY (consent_id) REFERENCES public.studio_voice_consents(id)
  ON DELETE SET NULL;

-- Generations now point at a voice row, so the hard-coded two-voice check on
-- the old text column no longer applies.
ALTER TABLE public.studio_generations
  DROP CONSTRAINT IF EXISTS studio_generations_voice_check;
ALTER TABLE public.studio_generations
  ADD COLUMN IF NOT EXISTS voice_id UUID
  REFERENCES public.studio_voices(id) ON DELETE SET NULL;

ALTER TABLE public.studio_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_voice_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_voices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.studio_voice_consents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_voices TO service_role;
GRANT ALL ON public.studio_voice_consents TO service_role;

-- Seeds. Owner ids are looked up so another environment without these users
-- simply gets NULL owners instead of a failed migration.
INSERT INTO public.studio_voices
  (key, label, description, cartesia_voice_id, kind, owner_user_id, status)
VALUES
  ('sandrine', 'Sandrine', 'Voix par défaut de Roogo',
   '2435841c-fce7-4fd5-aed1-dc7008eb7d20', 'system', NULL, 'active'),
  ('salif', 'Voix de Salif', 'Salif en français',
   '16dba105-0026-4ff7-bf90-12562786a97c', 'system',
   (SELECT id FROM public.users
     WHERE id = '45a9f489-0b10-4377-81bb-688d896995fc'), 'active'),
  ('ablasse', 'Voix d''Ablassé', 'Ablassé en français',
   'f322e8b8-53e7-4373-8074-3a1e0371cc35', 'system',
   (SELECT id FROM public.users
     WHERE id = '6834a456-3ec4-42d1-98ae-afb4dcc2690b'), 'locked')
ON CONFLICT (key) DO NOTHING;

-- Founder-attested record for Salif's own voice (he authorized staff use on
-- 2026-10-05). Ablassé's voice stays locked until he accepts the terms.
INSERT INTO public.studio_voice_consents
  (voice_id, user_id, terms_version, method, accepted_at)
SELECT v.id, v.owner_user_id, 'founder-attested-2026-10-05',
       'founder_attested', TIMESTAMPTZ '2026-10-05 00:00:00+00'
FROM public.studio_voices v
WHERE v.key = 'salif'
  AND NOT EXISTS (
    SELECT 1 FROM public.studio_voice_consents c WHERE c.voice_id = v.id
  );

UPDATE public.studio_voices v
   SET consent_id = c.id
  FROM public.studio_voice_consents c
 WHERE c.voice_id = v.id AND v.key = 'salif' AND v.consent_id IS NULL;

-- The owner of a locked voice accepts the terms: record it and unlock the
-- voice in one transaction. Returns the consent id, or NULL when the voice is
-- not locked, does not exist, or belongs to someone else.
CREATE OR REPLACE FUNCTION public.accept_studio_voice_consent(
  p_voice_id UUID,
  p_user_id UUID,
  p_terms_version TEXT,
  p_terms_hash TEXT,
  p_ip TEXT,
  p_user_agent TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.studio_voices%ROWTYPE;
  v_consent UUID;
BEGIN
  SELECT * INTO v FROM public.studio_voices WHERE id = p_voice_id FOR UPDATE;
  IF NOT FOUND
     OR v.owner_user_id IS DISTINCT FROM p_user_id
     OR v.status <> 'locked' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.studio_voice_consents
    (voice_id, user_id, terms_version, terms_text_hash, method, ip, user_agent)
  VALUES
    (p_voice_id, p_user_id, p_terms_version, p_terms_hash,
     'account_acceptance', p_ip, p_user_agent)
  RETURNING id INTO v_consent;

  UPDATE public.studio_voices
     SET status = 'active', consent_id = v_consent
   WHERE id = p_voice_id;

  RETURN v_consent;
END;
$$;

-- The owner or a founder withdraws a voice: it stops being usable at once and
-- the owner's single voice slot is freed. Returns the voice's kind and its
-- Cartesia id so the caller can delete a cloned voice at Cartesia, or NULL
-- when the voice is unknown, already revoked, or the actor may not revoke it.
CREATE OR REPLACE FUNCTION public.revoke_studio_voice(
  p_voice_id UUID,
  p_actor_id UUID,
  p_actor_is_founder BOOLEAN,
  p_reason TEXT
) RETURNS TABLE (kind TEXT, cartesia_voice_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.studio_voices%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.studio_voices WHERE id = p_voice_id FOR UPDATE;
  IF NOT FOUND OR v.status = 'revoked' THEN
    RETURN;
  END IF;
  IF NOT (p_actor_is_founder OR v.owner_user_id = p_actor_id) THEN
    RETURN;
  END IF;

  UPDATE public.studio_voices
     SET status = 'revoked',
         revoked_at = NOW(),
         revoked_by = p_actor_id,
         revoke_reason = LEFT(p_reason, 300)
   WHERE id = p_voice_id;

  UPDATE public.studio_voice_consents
     SET revoked_at = NOW(), revoke_reason = LEFT(p_reason, 300)
   WHERE voice_id = p_voice_id AND revoked_at IS NULL;

  RETURN QUERY SELECT v.kind, v.cartesia_voice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_studio_voice_consent(UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_studio_voice(UUID, UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_studio_voice_consent(UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_studio_voice(UUID, UUID, BOOLEAN, TEXT)
  TO service_role;
