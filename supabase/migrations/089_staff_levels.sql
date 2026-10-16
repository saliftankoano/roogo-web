-- Staff access levels (Salif, 2026-10-11 approval; built 2026-10-16).
-- Run after 088. Service role only; RLS stays on with no policies.
--
-- Vault: 03 Operations/Permissions de l'equipe par titre - proposition.md
--
--   * users.staff_level: the job title of a staff member. NULL on everyone who
--     is not staff, and on staff who have no level yet. A founder never has a
--     level (userType "founder" is enough). Mirrors Clerk publicMetadata.staffLevel.
--   * staff_invitations: replaces the shared STAFF_REGISTRATION_SECRET. The
--     founder or a director invites an email address with a level; only the
--     hash of the link token is stored.
--   * staff_access_log: who gave or took which access, to whom, and when. The
--     founder reads it (rule 4 of the approved note).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS staff_level TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_staff_level_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_staff_level_check CHECK (
    staff_level IS NULL
    OR staff_level IN ('director', 'assistant', 'advisor', 'intern')
  );

CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  level TEXT NOT NULL CHECK (level IN ('director', 'assistant', 'advisor', 'intern')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ
);

-- One open invitation per email address.
CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_one_open_per_email
  ON public.staff_invitations (lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.staff_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN (
    'invite', 'invite_revoked', 'accepted', 'level_set', 'access_removed'
  )),
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  target_name TEXT,
  target_email TEXT,
  from_level TEXT,
  to_level TEXT,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_access_log_created_at_idx
  ON public.staff_access_log (created_at DESC);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_access_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_invitations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staff_access_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_invitations TO service_role;
GRANT ALL ON public.staff_access_log TO service_role;
