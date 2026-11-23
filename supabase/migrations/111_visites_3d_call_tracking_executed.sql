-- 111: Visites 3D call tracking (three PRDs approved by Salif on 2026-11-22).
--
-- NOT EXECUTED. Salif runs it. Depends on 089_staff_tasks and
-- 092_call_notes_and_demande_replies (both applied). Safe to run twice.
--
-- 1. Journal des appels de prospection 3D. A business called cold (restaurant,
--    hotel, event hall, promoter) is a « prospect » in staff_prospects, not a
--    user. A 3D call is a row of staff_call_notes with subject_kind
--    'visite_3d', prospect_id and the five points: who answered, the answer
--    to the problem question (plus their words), the objection (plus their
--    words), what interested them, the result. contact_number (1, 2, 3...) is
--    set by the API from the business's earlier contacts.
--
-- 2. Objectif d'appels quotidien. staff_call_goals holds one daily target per
--    staff member (set by the founder), staff_call_goal_changes logs every
--    change (who, when, old and new value). Counts are read from
--    staff_call_notes (every logged call counts, follow-ups included).
--
-- 3. Trois contacts par prospect. Follow-up tasks are ordinary staff_tasks
--    with prospect_id and prospect_step (2 = call back on day 2,
--    3 = WhatsApp message on day 7). The sequence state lives on the prospect
--    (en_cours, oui, non, a_reprendre). No second task system.
--
-- Access follows 089 and 092: RLS on, no policies, anon and authenticated
-- revoked, service role only through /api/admin routes that check the level.

BEGIN;

-- ---------------------------------------------------------------------------
-- Businesses called for Visites 3D
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  kind TEXT NOT NULL CHECK (kind IN ('restaurant', 'hotel', 'salle_de_fete', 'promoteur', 'autre')),
  phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 40),
  -- Digits only (the last 8 for Burkina numbers), used to spot duplicates.
  phone_digits TEXT CHECK (phone_digits IS NULL OR phone_digits ~ '^[0-9]{6,15}$'),
  quartier TEXT CHECK (quartier IS NULL OR char_length(quartier) <= 80),
  city TEXT CHECK (city IS NULL OR char_length(city) <= 80),
  maps_url TEXT CHECK (maps_url IS NULL OR (char_length(maps_url) <= 500 AND maps_url ~* '^https?://')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Three-contact sequence.
  sequence_state TEXT NOT NULL DEFAULT 'en_cours' CHECK (sequence_state IN ('en_cours', 'oui', 'non', 'a_reprendre')),
  contacts_count INTEGER NOT NULL DEFAULT 0 CHECK (contacts_count >= 0),
  first_contact_on DATE,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_prospects_phone
  ON public.staff_prospects (phone_digits)
  WHERE phone_digits IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_prospects_creator
  ON public.staff_prospects (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_prospects_updated
  ON public.staff_prospects (updated_at DESC);

ALTER TABLE public.staff_prospects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_prospects FROM anon, authenticated;
GRANT ALL ON public.staff_prospects TO service_role;

COMMENT ON TABLE public.staff_prospects IS
  'Businesses called for Visites 3D (not Roogo users). Staff only, service role only, read through /api/admin/prospects.';

-- ---------------------------------------------------------------------------
-- The five points on a call note
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff_call_notes
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES public.staff_prospects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contact_number SMALLINT CHECK (contact_number IS NULL OR contact_number BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IS NULL OR channel IN ('appel', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS answered_by TEXT CHECK (answered_by IS NULL OR answered_by IN ('patron', 'gerant', 'employe', 'pas_de_reponse')),
  ADD COLUMN IF NOT EXISTS problem_answer TEXT CHECK (problem_answer IS NULL OR problem_answer IN ('oui', 'non', 'pas_clair')),
  ADD COLUMN IF NOT EXISTS problem_words TEXT CHECK (problem_words IS NULL OR char_length(problem_words) <= 500),
  ADD COLUMN IF NOT EXISTS objection TEXT CHECK (objection IS NULL OR objection IN ('cher', 'deja_photos', 'clients_connaissent', 'reflechir', 'autre')),
  ADD COLUMN IF NOT EXISTS objection_words TEXT CHECK (objection_words IS NULL OR char_length(objection_words) <= 500),
  ADD COLUMN IF NOT EXISTS interest TEXT CHECK (interest IS NULL OR interest IN ('exemple', 'prix', 'route', 'rien')),
  ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IS NULL OR result IN ('oui', 'a_rappeler', 'non'));

-- A 3D call has its own subject kind, for the « Visites 3D » filter.
ALTER TABLE public.staff_call_notes DROP CONSTRAINT IF EXISTS staff_call_notes_subject_kind_check;
ALTER TABLE public.staff_call_notes
  ADD CONSTRAINT staff_call_notes_subject_kind_check
  CHECK (subject_kind IN ('demande', 'proprietaire', 'vente', 'autre', 'visite_3d'));

-- Who answered and the result are required on a 3D call (PRD open question 2).
ALTER TABLE public.staff_call_notes DROP CONSTRAINT IF EXISTS staff_call_notes_3d_required;
ALTER TABLE public.staff_call_notes
  ADD CONSTRAINT staff_call_notes_3d_required
  CHECK (prospect_id IS NULL OR (answered_by IS NOT NULL AND result IS NOT NULL AND contact_number IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_staff_call_notes_prospect
  ON public.staff_call_notes (prospect_id, created_at)
  WHERE prospect_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Follow-up tasks of the sequence
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES public.staff_prospects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS prospect_step SMALLINT CHECK (prospect_step IS NULL OR prospect_step IN (2, 3));

CREATE INDEX IF NOT EXISTS idx_staff_tasks_prospect
  ON public.staff_tasks (prospect_id)
  WHERE prospect_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Daily call goal per staff member
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_call_goals (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  daily_target INTEGER NOT NULL CHECK (daily_target BETWEEN 1 AND 200),
  set_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff_call_goal_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  old_target INTEGER,
  new_target INTEGER,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_call_goal_changes_user
  ON public.staff_call_goal_changes (user_id, changed_at DESC);

ALTER TABLE public.staff_call_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_call_goals FROM anon, authenticated;
GRANT ALL ON public.staff_call_goals TO service_role;

ALTER TABLE public.staff_call_goal_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_call_goal_changes FROM anon, authenticated;
GRANT ALL ON public.staff_call_goal_changes TO service_role;

COMMENT ON TABLE public.staff_call_goals IS
  'Daily call goal per staff member (calls per working day, Monday to Friday). Set by the founder. Service role only.';
COMMENT ON TABLE public.staff_call_goal_changes IS
  'Who changed a daily call goal, when, from what to what. Service role only.';

COMMIT;
