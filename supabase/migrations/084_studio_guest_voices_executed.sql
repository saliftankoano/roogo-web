-- Content Studio: guest voices (Salif, 2026-10-13).
-- Run after 083. Staff only; RLS stays on with no policies, service role only.
--
-- A staff member can record the voice of an outside person (an owner, a
-- client) who is present and reads the consent aloud. The guest is told that
-- the voice will be used for Roogo marketing, with no time limit.
--
--   * studio_voices: kind 'guest'; guest_name; added_by (the staff member who
--     recorded the guest). Guest voices have no owner, so they never take the
--     staff member's single voice slot (studio_voices_one_per_owner).
--   * studio_voice_challenges and studio_voice_consents: subject ('self' or
--     'guest') and subject_name, so the consent record names who spoke.
--   * revoke_studio_voice: a founder, the owner, or for a guest voice the staff
--     member who added it, can withdraw it.

ALTER TABLE public.studio_voices
  DROP CONSTRAINT IF EXISTS studio_voices_kind_check;
ALTER TABLE public.studio_voices
  ADD CONSTRAINT studio_voices_kind_check CHECK (kind IN ('system', 'cloned', 'guest'));

ALTER TABLE public.studio_voices
  ADD COLUMN IF NOT EXISTS guest_name TEXT CHECK (guest_name IS NULL OR char_length(guest_name) BETWEEN 2 AND 80),
  ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.studio_voices
  DROP CONSTRAINT IF EXISTS studio_voices_guest_shape;
ALTER TABLE public.studio_voices
  ADD CONSTRAINT studio_voices_guest_shape CHECK (
    (kind = 'guest' AND owner_user_id IS NULL AND guest_name IS NOT NULL)
    OR (kind <> 'guest' AND guest_name IS NULL)
  );

ALTER TABLE public.studio_voice_challenges
  ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT 'self' CHECK (subject IN ('self', 'guest')),
  ADD COLUMN IF NOT EXISTS subject_name TEXT;

ALTER TABLE public.studio_voice_consents
  ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT 'self' CHECK (subject IN ('self', 'guest')),
  ADD COLUMN IF NOT EXISTS subject_name TEXT;

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
  IF NOT (
    p_actor_is_founder
    OR v.owner_user_id = p_actor_id
    OR (v.kind = 'guest' AND v.added_by = p_actor_id)
  ) THEN
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

REVOKE ALL ON FUNCTION public.revoke_studio_voice(UUID, UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_studio_voice(UUID, UUID, BOOLEAN, TEXT)
  TO service_role;
