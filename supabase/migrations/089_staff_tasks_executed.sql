-- 089: staff briefing and team board (Mon briefing / L'équipe), v1.
--
-- NOT EXECUTED. Written for review; run it only after Salif approves.
--
-- Two tables:
--   staff_titles  the job title of a staff member (Directeur, Assistant,
--                 Conseillère, Stagiaire). Fondateur is not stored here: it
--                 stays the Clerk userType "founder". A staff member with no
--                 row is treated as Conseillère by the app. Only the founder
--                 edits this table, through /api/admin/team-tasks/titles.
--   staff_tasks   tasks given by hand (kind 'manuel'), asks from a Directeur
--                 to the founder (kind 'demande'), and the record left when
--                 someone ticks an automatic item whose source has no status
--                 of its own (kind 'auto', e.g. a confirmed visit). Automatic
--                 items are otherwise computed at read time from their own
--                 tables and never copied here.
--
-- Access follows the admin pattern of 079 (Studio chat): RLS on, no policies,
-- every read and write goes through the service role in /api/admin routes,
-- which check the caller's level (staff, Directeur, founder) server-side.
-- Times: Ouagadougou is UTC all year, so due_date and due_time are local
-- Ouagadougou dates and times and completed_at is a plain timestamptz.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_titles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL
    CHECK (title IN ('directeur', 'assistant', 'conseillere', 'stagiaire')),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who must do it. Never NULL for 'manuel' and 'demande'; for a 'demande'
  -- it is the founder the ask was sent to.
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'manuel'
    CHECK (kind IN ('manuel', 'demande', 'auto')),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
  due_date DATE NOT NULL,
  -- Optional "avant HH:MM".
  due_time TIME,
  status TEXT NOT NULL DEFAULT 'a_faire'
    CHECK (status IN ('a_faire', 'fait', 'reportee')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Optional links (Lier à).
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  visit_request_id UUID REFERENCES public.visit_requests(id) ON DELETE SET NULL,
  studio_project_id UUID REFERENCES public.studio_conversations(id) ON DELETE SET NULL,

  -- Key of the automatic item this row stands for, when a Directeur or the
  -- founder gave an unowned item to someone ("Attribuer") or someone ticked
  -- an automatic item ('auto'). Example: 'visit:<uuid>'. One row per item.
  source_key TEXT CHECK (source_key IS NULL OR char_length(source_key) <= 300),
  -- Where the work is done, copied from the automatic item.
  source_href TEXT CHECK (source_href IS NULL OR source_href LIKE '/admin%'),

  -- Demande fields.
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 2000),
  reply_text TEXT CHECK (reply_text IS NULL OR char_length(reply_text) <= 500),
  replied_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT staff_tasks_demande_reason
    CHECK (kind <> 'demande' OR char_length(btrim(coalesce(reason, ''))) > 0),
  CONSTRAINT staff_tasks_done_has_time
    CHECK ((status = 'fait') = (completed_at IS NOT NULL)),
  CONSTRAINT staff_tasks_auto_has_source
    CHECK (kind <> 'auto' OR source_key IS NOT NULL),
  CONSTRAINT staff_tasks_reply_has_time
    CHECK (reply_text IS NULL OR replied_at IS NOT NULL)
);

-- Briefing: one person's open and recent tasks.
CREATE INDEX IF NOT EXISTS idx_staff_tasks_owner_due
  ON public.staff_tasks (owner_id, status, due_date);
-- Team board and past-week bundles: completions by time.
CREATE INDEX IF NOT EXISTS idx_staff_tasks_completed
  ON public.staff_tasks (completed_at DESC)
  WHERE completed_at IS NOT NULL;
-- Open work across the team.
CREATE INDEX IF NOT EXISTS idx_staff_tasks_open_due
  ON public.staff_tasks (due_date)
  WHERE status <> 'fait';
-- Founder's pending asks.
CREATE INDEX IF NOT EXISTS idx_staff_tasks_demandes
  ON public.staff_tasks (owner_id, created_at DESC)
  WHERE kind = 'demande';
-- One row per automatic item.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_tasks_source_key
  ON public.staff_tasks (source_key)
  WHERE source_key IS NOT NULL;

DROP TRIGGER IF EXISTS update_staff_tasks_updated_at ON public.staff_tasks;
CREATE TRIGGER update_staff_tasks_updated_at
  BEFORE UPDATE ON public.staff_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_staff_titles_updated_at ON public.staff_titles;
CREATE TRIGGER update_staff_titles_updated_at
  BEFORE UPDATE ON public.staff_titles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.staff_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_tasks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_titles FROM anon, authenticated;
REVOKE ALL ON public.staff_tasks FROM anon, authenticated;

COMMENT ON TABLE public.staff_titles IS
  'Job title per staff member (Directeur, Assistant, Conseillère, Stagiaire). Founder stays Clerk userType founder. Service role only.';
COMMENT ON TABLE public.staff_tasks IS
  'Manual tasks, Directeur asks to the founder, and ticks on automatic briefing items without their own status. Service role only.';

COMMIT;
