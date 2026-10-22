-- 090: in-app field visit sheet ("Fiche de visite"), v1.
--
-- NOT EXECUTED. Written for review; run it only after Salif approves.
--
-- Depends on:
--   086_studio_field_media.sql  (NOT applied yet: run it first)
--   089_staff_tasks.sql         (applied)
--
-- One row per outing to film a property. The phone fills it step by step
-- (Infos, Avant de partir, Départ du bureau, Sur place, Départ du site,
-- Retour au bureau, Tournage terminé) and saves every change. Tick times are
-- the device's own clock at the moment of the tick, so a Directeur or the
-- founder can see the real timing of the visit. Ouagadougou is UTC all year.
--
-- Access follows the admin pattern of 079 and 089: RLS on, no policies, every
-- read and write goes through the service role in /api/admin/field-visits
-- routes, which check the caller is staff (and Directeur or founder for the
-- follow-up list) server-side.

BEGIN;

CREATE TABLE IF NOT EXISTS public.field_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('location', 'vente')),

  -- The team: one or two people, never more (paper sheet rule).
  person1_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  person2_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'en_cours'
    CHECK (status IN ('en_cours', 'termine', 'abandonne')),
  -- 0 Infos, 1..5 the five steps, 6 Tournage terminé.
  step SMALLINT NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 6),
  visit_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC')::date),

  -- Checklist ticks: {"a1": "2026-10-14T08:52:10.000Z", ...}.
  check_times JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The four shots on site, in order: {"marche": iso, "photos": iso, "presentation": iso, "scan": iso}.
  shot_times JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- When the "ticked too fast" notice was shown (3 ticks within 20 seconds): [iso, ...].
  batch_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- The four time buttons.
  departed_office_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  left_site_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,

  -- "Prendre la position ici" (browser geolocation), or why it was skipped.
  latitude DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  location_accuracy_m REAL CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0),
  located_at TIMESTAMPTZ,
  location_skipped_reason TEXT CHECK (location_skipped_reason IS NULL OR char_length(location_skipped_reason) <= 200),

  -- Property facts for captions: {"prix", "pieces", "eauElec", "documents", "acces"}.
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Upload summary per deliverable, recomputed by the server from
  -- studio_field_media: {"marche": {"ready": 2, "uploading": 0, "failed": 0, "bytes": 123, "seconds": 190}, ...}.
  uploads JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The visit's Drive folder ("Vente|Location / <CODE> <titre>") and one subfolder per deliverable.
  drive_folder_id TEXT,
  drive_folder_path TEXT,
  drive_subfolders JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Tournage terminé: who does each follow-up task (chosen before confirming),
  -- the staff_tasks rows created, and the planned publication dates in
  -- business days (Monday to Friday; Burkina public holidays not handled yet).
  task_owners JSONB NOT NULL DEFAULT '{}'::jsonb,
  task_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  deliverable_dates JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Hook for the Studio publishing calendar (branch not merged yet): set
  -- when calendar publications have been created from deliverable_dates.
  publications_created_at TIMESTAMPTZ,

  -- Last change as seen by the device that made it (offline edits sync later).
  client_updated_at TIMESTAMPTZ,

  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT field_visits_two_people CHECK (person2_id IS NULL OR person2_id <> person1_id),
  CONSTRAINT field_visits_done_has_time CHECK ((status = 'termine') = (completed_at IS NOT NULL)),
  CONSTRAINT field_visits_check_times_object CHECK (jsonb_typeof(check_times) = 'object'),
  CONSTRAINT field_visits_shot_times_object CHECK (jsonb_typeof(shot_times) = 'object'),
  CONSTRAINT field_visits_batch_warnings_array CHECK (jsonb_typeof(batch_warnings) = 'array'),
  CONSTRAINT field_visits_facts_object CHECK (jsonb_typeof(facts) = 'object')
);

-- At most one unfinished sheet per property ("Fiche en cours retrouvée").
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_visits_open_property
  ON public.field_visits (property_id)
  WHERE status = 'en_cours';
-- Follow-up list, newest first.
CREATE INDEX IF NOT EXISTS idx_field_visits_created
  ON public.field_visits (created_at DESC);
-- "Sur le terrain" notices in the briefing: today's visits.
CREATE INDEX IF NOT EXISTS idx_field_visits_visit_date
  ON public.field_visits (visit_date);

DROP TRIGGER IF EXISTS update_field_visits_updated_at ON public.field_visits;
CREATE TRIGGER update_field_visits_updated_at
  BEFORE UPDATE ON public.field_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.field_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_visits FROM anon, authenticated;
GRANT ALL ON public.field_visits TO service_role;

COMMENT ON TABLE public.field_visits IS
  'In-app field visit sheet (Fiche de visite): steps, tick times, the four times, position, facts, uploads per deliverable and the follow-up tasks. Service role only.';

-- Field media uploaded from a sheet: which sheet and which deliverable. The
-- scan 3D and the Insta360 trips can be files that are neither a photo nor a
-- video (.insv, .insp), stored with kind 'file'. The Studio list keeps
-- showing photos and videos only.
ALTER TABLE public.studio_field_media
  ADD COLUMN IF NOT EXISTS field_visit_id UUID REFERENCES public.field_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deliverable TEXT
    CHECK (deliverable IS NULL OR deliverable IN ('marche', 'photos', 'presentation', 'scan', 'trajets'));

ALTER TABLE public.studio_field_media DROP CONSTRAINT IF EXISTS studio_field_media_kind_check;
ALTER TABLE public.studio_field_media
  ADD CONSTRAINT studio_field_media_kind_check CHECK (kind IN ('photo', 'video', 'file'));

CREATE INDEX IF NOT EXISTS studio_field_media_field_visit
  ON public.studio_field_media (field_visit_id, deliverable)
  WHERE field_visit_id IS NOT NULL;

-- Tasks created when a sheet is finished. Each one also carries
-- source_key 'field-visit:<visit id>:<task key>', whose unique index (089)
-- makes finishing twice create nothing new.
ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS field_visit_id UUID REFERENCES public.field_visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_tasks_field_visit
  ON public.staff_tasks (field_visit_id)
  WHERE field_visit_id IS NOT NULL;

COMMIT;
