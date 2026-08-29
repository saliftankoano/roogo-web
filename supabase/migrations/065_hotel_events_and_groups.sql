-- Operational event codes, negotiated rates, and multi-hotel groups.

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS per_diem_limit INTEGER;

UPDATE public.events
SET code = 'EV-' || upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE code IS NULL;

ALTER TABLE public.events ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_code_unique ON public.events(upper(code));

ALTER TABLE public.event_room_blocks
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pledged';
ALTER TABLE public.event_room_blocks
  DROP CONSTRAINT IF EXISTS event_room_blocks_status_check;
ALTER TABLE public.event_room_blocks
  ADD CONSTRAINT event_room_blocks_status_check
  CHECK (status IN ('pledged', 'withdrawn'));

CREATE TABLE IF NOT EXISTS public.hotel_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hotel_group_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.hotel_groups(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL UNIQUE REFERENCES public.hotels(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_group_hotels_group
  ON public.hotel_group_hotels(group_id);

ALTER TABLE public.hotel_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_group_hotels ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_user_hotel_group_member(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hotel_group_hotels gh
    JOIN hotel_members hm ON hm.hotel_id = gh.hotel_id
    JOIN users u ON u.id = hm.user_id
    WHERE gh.group_id = p_group_id
      AND hm.status = 'active'
      AND u.clerk_id = auth.jwt() ->> 'sub'
  );
$$;

CREATE POLICY "Group members view hotel groups"
  ON public.hotel_groups FOR SELECT
  USING (current_user_hotel_group_member(id));

CREATE POLICY "Group members view group hotels"
  ON public.hotel_group_hotels FOR SELECT
  USING (current_user_hotel_group_member(group_id));

-- Serialize reservations for the same event room block so two requests cannot
-- both claim the final pledged room. API validation provides friendly errors;
-- this trigger is the database-level concurrency guarantee.
CREATE OR REPLACE FUNCTION enforce_event_room_block_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pledged_count INTEGER;
  reserved_count INTEGER;
BEGIN
  IF NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN (
    'requested',
    'approved_awaiting_payment',
    'payment_pending',
    'confirmed',
    'checked_in',
    'checkin_issue',
    'checkout_reported',
    'post_checkout_review',
    'issue_open',
    'completed'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.event_id::text || ':' || NEW.room_type_id::text, 0)
  );

  SELECT count_pledged INTO pledged_count
  FROM event_room_blocks
  WHERE event_id = NEW.event_id
    AND room_type_id = NEW.room_type_id
    AND property_id = NEW.property_id
    AND status = 'pledged';

  IF pledged_count IS NULL THEN
    RAISE EXCEPTION 'EVENT_ROOM_BLOCK_UNAVAILABLE';
  END IF;

  SELECT count(*) INTO reserved_count
  FROM daily_booking_requests
  WHERE event_id = NEW.event_id
    AND room_type_id = NEW.room_type_id
    AND id IS DISTINCT FROM NEW.id
    AND status IN (
      'requested',
      'approved_awaiting_payment',
      'payment_pending',
      'confirmed',
      'checked_in',
      'checkin_issue',
      'checkout_reported',
      'post_checkout_review',
      'issue_open',
      'completed'
    )
    AND start_date < NEW.end_date
    AND end_date > NEW.start_date;

  IF reserved_count >= pledged_count THEN
    RAISE EXCEPTION 'EVENT_ROOM_BLOCK_FULL';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_room_block_capacity ON public.daily_booking_requests;
CREATE TRIGGER trg_event_room_block_capacity
  BEFORE INSERT OR UPDATE OF event_id, room_type_id, property_id, status, start_date, end_date
  ON public.daily_booking_requests
  FOR EACH ROW
  WHEN (NEW.event_id IS NOT NULL)
  EXECUTE FUNCTION enforce_event_room_block_capacity();

COMMIT;
