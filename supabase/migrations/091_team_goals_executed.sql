-- 091: team goals ("Nos objectifs"), their levers and their proof, v1.
--
-- NOT EXECUTED. Written for review; run it only after Salif approves.
--
-- Depends on 089_staff_tasks.sql (applied).
--
-- The founder sets goals everyone on the team sees. The principle shown in
-- the app: « Qu’est-ce qui doit se passer pour que ce soit inévitable ? ».
-- Nothing on the goals strip is static: every number is computed at read
-- time from its own records, or read from a dated reading with its proof.
--
--   team_goals              what we aim for: a metric, a target and a period.
--   team_goal_readings      manual readings for metrics the app cannot read
--                           (TikTok, Facebook, Instagram followers), with an
--                           optional screenshot in the private bucket
--                           team-goal-proofs. Keyed by metric, not by goal:
--                           the follower count belongs to the account, so two
--                           goals on the same account share the readings.
--   team_goal_sales         a sale confirmed by the founder (signature date).
--                           Roogo has no "sold" status on properties, so a
--                           property only counts as sold once confirmed here.
--   team_goal_levers        what someone does every week so the goal becomes
--                           inevitable: owner, title, rhythm, weekly target.
--   team_goal_lever_ticks   one row per time the owner did the lever. The
--                           week's progress is ticks of the week plus done
--                           tasks linked to the lever (staff_tasks.lever_id).
--
-- Metrics computed from records (no table here): users (users rows minus
-- staff, founder and test accounts), properties_under_contract (properties
-- with an active rental_agreements row), properties_listed_in_period
-- (published_at inside the goal's period, test listings excluded).
--
-- Access follows 089/090: RLS on, no policies, every read and write goes
-- through the service role in /api/admin/goals routes, which check the
-- caller's level server-side (founder for goals, levers and sales; founder or
-- Directeur for readings; lever owner, Directeur or founder for ticks).
-- Ouagadougou is UTC all year: dates are plain local dates.

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  metric TEXT NOT NULL CHECK (metric IN (
    'users',
    'properties_under_contract',
    'properties_sold',
    'properties_listed_in_period',
    'tiktok_followers',
    'facebook_followers',
    'instagram_followers'
  )),
  target INTEGER NOT NULL CHECK (target BETWEEN 1 AND 100000000),
  -- month: one calendar month. recurring_month: every month, the counter
  -- starts again on the 1st and past months stay as history (end_date NULL).
  -- quarter, year: one calendar quarter or year.
  period TEXT NOT NULL CHECK (period IN ('month', 'recurring_month', 'quarter', 'year')),
  start_date DATE NOT NULL,
  end_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- "Retirer l’objectif": hidden from everyone, kept for history; "Annuler"
  -- clears it again.
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_goals_end_date CHECK (
    (period = 'recurring_month' AND end_date IS NULL)
    OR (period <> 'recurring_month' AND end_date IS NOT NULL AND end_date >= start_date)
  )
);

CREATE INDEX IF NOT EXISTS idx_team_goals_active
  ON public.team_goals (sort_order, created_at)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.team_goal_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL CHECK (metric IN ('tiktok_followers', 'facebook_followers', 'instagram_followers')),
  value INTEGER NOT NULL CHECK (value BETWEEN 0 AND 1000000000),
  measured_on DATE NOT NULL,
  entered_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Path inside the private bucket team-goal-proofs, e.g. readings/tiktok_followers/<uuid>.jpg.
  proof_path TEXT CHECK (proof_path IS NULL OR char_length(proof_path) <= 300),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_goal_readings_metric
  ON public.team_goal_readings (metric, measured_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.team_goal_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- Date the deed was signed at the notary.
  signed_on DATE NOT NULL,
  confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A property is sold once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_goal_sales_property
  ON public.team_goal_sales (property_id);
CREATE INDEX IF NOT EXISTS idx_team_goal_sales_signed
  ON public.team_goal_sales (signed_on DESC);

CREATE TABLE IF NOT EXISTS public.team_goal_levers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.team_goals(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  -- "Chaque semaine", "Du lundi au samedi", "Chaque visite".
  rhythm TEXT CHECK (rhythm IS NULL OR char_length(rhythm) <= 80),
  weekly_target INTEGER NOT NULL DEFAULT 1 CHECK (weekly_target BETWEEN 1 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_goal_levers_goal
  ON public.team_goal_levers (goal_id, sort_order)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_goal_levers_owner
  ON public.team_goal_levers (owner_id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.team_goal_lever_ticks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lever_id UUID NOT NULL REFERENCES public.team_goal_levers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ticked_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_goal_lever_ticks_lever
  ON public.team_goal_lever_ticks (lever_id, ticked_on DESC);

-- « Pour : <objectif> » on a task, and the lever it counts for.
ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.team_goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lever_id UUID REFERENCES public.team_goal_levers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_tasks_goal
  ON public.staff_tasks (goal_id)
  WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_tasks_lever_done
  ON public.staff_tasks (lever_id, completed_at)
  WHERE lever_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_team_goals_updated_at ON public.team_goals;
CREATE TRIGGER update_team_goals_updated_at
  BEFORE UPDATE ON public.team_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_team_goal_levers_updated_at ON public.team_goal_levers;
CREATE TRIGGER update_team_goal_levers_updated_at
  BEFORE UPDATE ON public.team_goal_levers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_goal_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_goal_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_goal_levers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_goal_lever_ticks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.team_goals FROM anon, authenticated;
REVOKE ALL ON public.team_goal_readings FROM anon, authenticated;
REVOKE ALL ON public.team_goal_sales FROM anon, authenticated;
REVOKE ALL ON public.team_goal_levers FROM anon, authenticated;
REVOKE ALL ON public.team_goal_lever_ticks FROM anon, authenticated;

GRANT ALL ON public.team_goals TO service_role;
GRANT ALL ON public.team_goal_readings TO service_role;
GRANT ALL ON public.team_goal_sales TO service_role;
GRANT ALL ON public.team_goal_levers TO service_role;
GRANT ALL ON public.team_goal_lever_ticks TO service_role;

COMMENT ON TABLE public.team_goals IS
  'Team goals (Nos objectifs): metric, target, period. Set by the founder, seen by all staff. Service role only.';
COMMENT ON TABLE public.team_goal_readings IS
  'Dated manual readings (followers) with an optional screenshot in bucket team-goal-proofs. Service role only.';
COMMENT ON TABLE public.team_goal_sales IS
  'Sales confirmed by the founder (signature date at the notary). The only source of the properties_sold metric. Service role only.';
COMMENT ON TABLE public.team_goal_levers IS
  'Weekly levers of a goal: owner, title, rhythm, weekly target. Service role only.';
COMMENT ON TABLE public.team_goal_lever_ticks IS
  'One row each time a lever was done. Service role only.';

-- Screenshots that prove a manual reading. Private: the API hands out short
-- signed links. Only compressed images (the client re-encodes to JPEG).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('team-goal-proofs', 'team-goal-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Seed: the five goals for the end of 2026 (approved with Salif on
-- 2026-10-16), and the two follower counts read that day. created_by is the
-- founder account when it exists. Safe to run twice.
WITH founder AS (
  SELECT id FROM public.users WHERE lower(email) = 'salift@roogobf.com' LIMIT 1
), seed (title, metric, target, sort_order) AS (
  VALUES
    ('1 000 utilisateurs sur Roogo', 'users', 1000, 1),
    ('1 000 abonnés TikTok', 'tiktok_followers', 1000, 2),
    ('2 500 abonnés Facebook', 'facebook_followers', 2500, 3),
    ('2 biens vendus', 'properties_sold', 2, 4),
    ('2 biens loués sous contrat Roogo', 'properties_under_contract', 2, 5)
)
INSERT INTO public.team_goals (title, metric, target, period, start_date, end_date, sort_order, created_by)
SELECT seed.title, seed.metric, seed.target, 'year', DATE '2026-01-01', DATE '2026-12-31', seed.sort_order,
       (SELECT id FROM founder)
FROM seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_goals g
  WHERE g.metric = seed.metric AND g.period = 'year' AND g.end_date = DATE '2026-12-31' AND g.archived_at IS NULL
);

WITH founder AS (
  SELECT id FROM public.users WHERE lower(email) = 'salift@roogobf.com' LIMIT 1
), seed (metric, value) AS (
  VALUES ('tiktok_followers', 583), ('facebook_followers', 1874)
)
INSERT INTO public.team_goal_readings (metric, value, measured_on, entered_by, note)
SELECT seed.metric, seed.value, DATE '2026-10-16', (SELECT id FROM founder), 'Premier relevé'
FROM seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_goal_readings r
  WHERE r.metric = seed.metric AND r.measured_on = DATE '2026-10-16'
);

COMMIT;
