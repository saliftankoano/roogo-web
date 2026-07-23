-- 055: Events layer DB prep (no API/UI yet)
-- Government group-travel events: the ministry organizes an event in a city,
-- hotels pledge room blocks, employees book within the event. Only the schema
-- ships now so bookings can carry event_id from day one (no backfill later).

BEGIN;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  expected_headcount INTEGER CHECK (expected_headcount > 0),
  organizer_name TEXT,
  organizer_contact TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'cancelled')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_room_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES room_types(id) ON DELETE CASCADE,
  count_pledged INTEGER NOT NULL CHECK (count_pledged > 0),
  event_nightly_rate INTEGER CHECK (event_nightly_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, room_type_id)
);

ALTER TABLE daily_booking_requests
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- Locked down until the events feature ships: Roogo staff/founders read only,
-- writes via service role.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_room_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view events"
ON events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.clerk_id = auth.jwt() ->> 'sub'
      AND u.user_type IN ('staff', 'founder')
  )
);

CREATE POLICY "Staff can view event room blocks"
ON event_room_blocks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.clerk_id = auth.jwt() ->> 'sub'
      AND u.user_type IN ('staff', 'founder')
  )
);

COMMIT;
