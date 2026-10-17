-- 092: call notes on call tasks, and the three answers to a demande, v1.
--
-- NOT EXECUTED. Written for review; run it only after Salif approves, after
-- 091_team_goals.sql.
--
-- Depends on 089_staff_tasks.sql (applied) and 068_property_requests (applied).
--
-- 1. Call tasks. A task can be a call (is_call). It shows an « Appel » tag
--    and « Appeler et noter ». The call note records the result, the notes
--    and what comes next. Rule approved by Salif (2026-10-16): a call task can
--    only be marked done once a result is chosen; the API refuses to tick an
--    is_call task that has no call note.
--    Call notes are visible to their author, the Directeur and the founder
--    only (checked by the API).
--
-- 2. Demandes (asks from a Directeur to the founder). « Je m’en occupe » is
--    unchanged (accepted_at). « Répondre » becomes three answers:
--      « Oui, vas-y »        decision = 'approved', decided_at: closed.
--      « Pas maintenant »    snoozed_until: hidden until that day, then pending again.
--      « Écrire une réponse » thread_started_at + staff_task_messages: a short
--                            thread; the sender or the founder closes it with
--                            « Réglé » (settled_at).
--    sender_seen_at and owner_seen_at drive the in-app unread signal (no push,
--    no email). reply_text from 089 stays readable for old answers.
--
-- Access follows 089: RLS on, no policies, service role only through
-- /api/admin routes that check who is asking.

BEGIN;

-- ---------------------------------------------------------------------------
-- Call tasks
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS is_call BOOLEAN NOT NULL DEFAULT false,
  -- Number to call when the person giving the task knows it.
  ADD COLUMN IF NOT EXISTS call_phone TEXT CHECK (call_phone IS NULL OR char_length(call_phone) <= 40),
  -- Who the call is with, for the « Notes d’appels » filters.
  ADD COLUMN IF NOT EXISTS call_subject TEXT CHECK (call_subject IS NULL OR call_subject IN ('demande', 'proprietaire', 'vente', 'autre')),
  -- Optional link to a property request (« demande de bien »).
  ADD COLUMN IF NOT EXISTS property_request_id UUID REFERENCES public.property_requests(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.staff_call_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  -- What the call was about, copied from the task when known, so previous
  -- calls on the same subject can be shown together.
  property_request_id UUID REFERENCES public.property_requests(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  visit_request_id UUID REFERENCES public.visit_requests(id) ON DELETE SET NULL,
  subject_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  subject_kind TEXT NOT NULL DEFAULT 'autre' CHECK (subject_kind IN ('demande', 'proprietaire', 'vente', 'autre')),
  subject_label TEXT CHECK (subject_label IS NULL OR char_length(subject_label) <= 200),
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('joint', 'pas_de_reponse', 'messagerie', 'mauvais_numero')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  next_step TEXT NOT NULL CHECK (next_step IN ('visite', 'rappel', 'passer_au_directeur', 'rien')),
  -- For 'rappel': when to call back (Ouagadougou = UTC).
  next_at TIMESTAMPTZ,
  -- The task created by the next step (rappel, visite, passer_au_directeur).
  follow_up_task_id UUID REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_call_notes_rappel_has_time CHECK (next_step <> 'rappel' OR next_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_staff_call_notes_created
  ON public.staff_call_notes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_call_notes_task
  ON public.staff_call_notes (task_id)
  WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_call_notes_request
  ON public.staff_call_notes (property_request_id)
  WHERE property_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_call_notes_property
  ON public.staff_call_notes (property_id)
  WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_call_notes_author
  ON public.staff_call_notes (author_id, created_at DESC);

ALTER TABLE public.staff_call_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_call_notes FROM anon, authenticated;
GRANT ALL ON public.staff_call_notes TO service_role;

COMMENT ON TABLE public.staff_call_notes IS
  'Call notes on call tasks: result, notes, next step. Visible to the author, the Directeur and the founder (API check). Service role only.';

-- ---------------------------------------------------------------------------
-- Demande answers
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS decision TEXT CHECK (decision IS NULL OR decision IN ('approved')),
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_until DATE,
  ADD COLUMN IF NOT EXISTS snoozed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thread_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_seen_at TIMESTAMPTZ;

ALTER TABLE public.staff_tasks DROP CONSTRAINT IF EXISTS staff_tasks_decision_has_time;
ALTER TABLE public.staff_tasks
  ADD CONSTRAINT staff_tasks_decision_has_time CHECK ((decision IS NULL) = (decided_at IS NULL));

CREATE TABLE IF NOT EXISTS public.staff_task_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.staff_tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_task_messages_task
  ON public.staff_task_messages (task_id, created_at);

ALTER TABLE public.staff_task_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_task_messages FROM anon, authenticated;
GRANT ALL ON public.staff_task_messages TO service_role;

COMMENT ON TABLE public.staff_task_messages IS
  'Short thread on a demande (« Écrire une réponse »). Only the sender and the founder addressed post (API check). Service role only.';

COMMIT;
