-- 099: end-of-day reports and absences (« Fin de journée »).
--
-- NOT EXECUTED. Written for review; Salif runs it after approving the PR.
-- The app works before it runs: Mon espace and L'équipe show a French notice
-- and every write answers 503 « migration 099 à lancer ».
--
-- One row per staff member per Ouagadougou day (Ouagadougou is UTC all year):
--   * the report the person sends from Mon espace from 15:00: what they did
--     (a copy of the tasks ticked that day plus free text), their actions for
--     tomorrow (each one became a staff_tasks row; its id is kept here, so
--     staff_tasks is not altered), what did not work and how to do better;
--   * or an absence, declared by the person or, on their behalf, by the
--     Directeur or the Fondateur (declared_by says who). The category is one of
--     four words; the optional note is read only by the Directeur, the
--     Fondateur and the person when they wrote it (checked in the app). The
--     form asks for no medical detail.
--
-- Access follows 089 (staff tasks): RLS on, no policies, anon and
-- authenticated revoked, every read and write through the service role in
-- /api/admin/day-reports, which checks the caller's level server-side.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_day_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Ouagadougou calendar date of the report.
  report_date DATE NOT NULL,

  -- « Fait aujourd'hui »: titles of the tasks ticked that day, copied when
  -- the report is sent (a task deleted later stays in the report).
  done_items JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(done_items) = 'array'),
  done_extra TEXT CHECK (done_extra IS NULL OR char_length(done_extra) <= 1000),
  -- « Mes actions pour demain »: [{ "title": "...", "task_id": "<staff_tasks.id>" }], 0 to 5.
  tomorrow_actions JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(tomorrow_actions) = 'array' AND jsonb_array_length(tomorrow_actions) <= 5),
  -- « Ce qui n'a pas marché aujourd'hui » and « Comment on pourrait faire mieux ».
  went_wrong TEXT CHECK (went_wrong IS NULL OR char_length(went_wrong) <= 600),
  improvement TEXT CHECK (improvement IS NULL OR char_length(improvement) <= 600),

  absent BOOLEAN NOT NULL DEFAULT FALSE,
  absence_category TEXT
    CHECK (absence_category IS NULL OR absence_category IN ('maladie', 'urgence_familiale', 'conge', 'autre')),
  absence_note TEXT CHECK (absence_note IS NULL OR char_length(absence_note) <= 500),
  -- Who declared the absence: the person, a Directeur or the Fondateur.
  declared_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- When the person sent their own report. NULL when the row only holds an
  -- absence declared by someone else.
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT staff_day_reports_one_per_day UNIQUE (user_id, report_date),
  CONSTRAINT staff_day_reports_absence_has_category
    CHECK (NOT absent OR absence_category IS NOT NULL),
  CONSTRAINT staff_day_reports_present_has_no_absence
    CHECK (absent OR (absence_category IS NULL AND absence_note IS NULL))
);

-- L'équipe: today's chips and the week's summary for everyone.
CREATE INDEX IF NOT EXISTS idx_staff_day_reports_date
  ON public.staff_day_reports (report_date DESC);

DROP TRIGGER IF EXISTS update_staff_day_reports_updated_at ON public.staff_day_reports;
CREATE TRIGGER update_staff_day_reports_updated_at
  BEFORE UPDATE ON public.staff_day_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.staff_day_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_day_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_day_reports TO service_role;

COMMENT ON TABLE public.staff_day_reports IS
  'End-of-day report and absence per staff member per Ouagadougou day (Fin de journée). Absence notes: Directeur, Fondateur and their own author only (checked in the app). Service role only.';

COMMIT;
