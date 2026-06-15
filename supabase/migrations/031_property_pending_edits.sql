BEGIN;

CREATE TABLE IF NOT EXISTS public.property_pending_edits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note  TEXT,
  reviewed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open changeset per property at a time.
CREATE UNIQUE INDEX IF NOT EXISTS property_pending_edits_one_pending
  ON public.property_pending_edits (property_id)
  WHERE (status = 'pending');

CREATE INDEX IF NOT EXISTS property_pending_edits_property_id_idx
  ON public.property_pending_edits (property_id);

CREATE INDEX IF NOT EXISTS property_pending_edits_status_idx
  ON public.property_pending_edits (status);

COMMENT ON TABLE public.property_pending_edits IS
  'Staged owner edits to published listings awaiting staff approval.';
COMMENT ON COLUMN public.property_pending_edits.payload IS
  'Changed fields only, using DB snake_case column names. amenities is an array of amenity name strings.';

COMMIT;
