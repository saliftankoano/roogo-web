-- 053: Hotel room types and count-based availability
-- A hotel property exposes N identical rooms per room type. Inventory is
-- derived from daily_booking_requests rows (no blocked-dates rows for hotels):
-- a room-night is consumed by a request in a finalized status, or by a
-- pending-payment request whose payment window has not expired (soft hold,
-- mirroring the booking_hold expiry semantics of hasDailyDateConflict).

BEGIN;

CREATE TABLE IF NOT EXISTS room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}',
  nightly_rate INTEGER NOT NULL CHECK (nightly_rate >= 0),
  capacity INTEGER NOT NULL DEFAULT 2 CHECK (capacity > 0),
  amenities TEXT[] NOT NULL DEFAULT '{}',
  total_count INTEGER NOT NULL CHECK (total_count > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_types_property ON room_types(property_id) WHERE is_active;

-- NO ACTION, not SET NULL: room_type_id is the hotel/non-hotel discriminator
-- on booking rows (finalize, approve, staff authz), so it must never be nulled
-- out from under a booking. NO ACTION (not RESTRICT) matters: it is checked at
-- end of statement, so deleting a whole PROPERTY still works (the bookings are
-- cascade-deleted via property_id in the same statement), while a direct
-- delete of a referenced room type raises 23503 and the route falls back to a
-- soft delete (is_active = false).
ALTER TABLE daily_booking_requests
  ADD COLUMN IF NOT EXISTS room_type_id UUID REFERENCES room_types(id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_dbr_room_type_dates
  ON daily_booking_requests(room_type_id, start_date, end_date)
  WHERE room_type_id IS NOT NULL;

-- The mobile property detail screen reads room types anonymously.
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room types are publicly readable"
ON room_types FOR SELECT
USING (true);

-- Minimum number of rooms of this type still free on ANY night of
-- [p_start, p_end). Per-night counting: overlap counting would overstate
-- occupancy for staggered bookings. Property-level blocks (owner_block for a
-- closure, plus legacy booked/booking_hold rows from before a conversion to
-- hotel) zero out availability for the whole hotel, mirroring the expiry AND
-- the fully-inclusive date semantics of hasDailyDateConflict. Inclusive means
-- a block starting on the requested checkout day (or ending on the check-in
-- day) conservatively blocks the stay, exactly as regular daily rentals
-- behave today; loosen both together or not at all.
CREATE OR REPLACE FUNCTION room_type_min_available(
  p_room_type_id UUID,
  p_start DATE,
  p_end DATE,
  p_exclude_request_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rt AS (
    SELECT id, property_id, total_count FROM room_types WHERE id = p_room_type_id
  ),
  property_block AS (
    SELECT 1
    FROM property_blocked_dates b
    JOIN rt ON b.property_id = rt.property_id
    WHERE b.block_type IN ('owner_block', 'booked', 'booking_hold')
      AND (
        b.block_type <> 'booking_hold'
        OR b.expires_at IS NULL
        OR b.expires_at > now()
      )
      AND b.start_date <= p_end
      AND b.end_date >= p_start
    LIMIT 1
  ),
  nights AS (
    SELECT generate_series(p_start, p_end - 1, interval '1 day')::date AS night
  ),
  occupancy AS (
    SELECT n.night, count(r.id) AS used
    FROM nights n
    LEFT JOIN daily_booking_requests r
      ON r.room_type_id = p_room_type_id
     AND (p_exclude_request_id IS NULL OR r.id <> p_exclude_request_id)
     AND r.start_date::date <= n.night
     AND r.end_date::date > n.night
     AND (
       r.status IN (
         'confirmed', 'checked_in', 'checkin_issue', 'checkout_reported',
         'post_checkout_review', 'issue_open', 'completed'
       )
       OR (
         r.status IN ('approved_awaiting_payment', 'payment_pending')
         AND r.payment_expires_at > now()
       )
     )
    GROUP BY n.night
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM property_block) THEN 0
    ELSE (SELECT total_count FROM rt) - COALESCE(MAX(used), 0)::integer
  END
  FROM occupancy;
$$;

CREATE OR REPLACE FUNCTION room_type_available(
  p_room_type_id UUID,
  p_start DATE,
  p_end DATE,
  p_exclude_request_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    room_type_min_available(p_room_type_id, p_start, p_end, p_exclude_request_id) > 0,
    false
  );
$$;

-- Atomic approval for hotel bookings. Takes an advisory lock on the room type
-- so two concurrent approvals of the last room cannot both succeed, re-checks
-- availability under the lock, then flips requested -> approved_awaiting_payment.
-- Returns no row when the request is missing, in the wrong status, or the
-- room type is sold out for those dates.
CREATE OR REPLACE FUNCTION approve_hotel_booking_request(
  p_request_id UUID,
  p_approved_at TIMESTAMPTZ,
  p_payment_expires_at TIMESTAMPTZ
) RETURNS SETOF daily_booking_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request daily_booking_requests%ROWTYPE;
  v_remaining INTEGER;
BEGIN
  SELECT * INTO v_request
  FROM daily_booking_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'requested' OR v_request.room_type_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_request.room_type_id::text, 0));

  v_remaining := room_type_min_available(
    v_request.room_type_id,
    v_request.start_date::date,
    v_request.end_date::date,
    p_request_id
  );

  IF v_remaining IS NULL OR v_remaining <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE daily_booking_requests
  SET status = 'approved_awaiting_payment',
      approved_at = p_approved_at,
      payment_expires_at = p_payment_expires_at
  WHERE id = p_request_id AND status = 'requested'
  RETURNING *;
END;
$$;

-- Atomic reclaim for a payment that lands after its window expired: under the
-- same advisory lock the approve RPC uses, re-check availability and put the
-- request back into a counted soft-hold state (payment_pending with a fresh
-- short window) so the room is occupied BEFORE finalize's multi-step
-- confirmation runs. Without this, a late finalize could interleave with a
-- concurrent last-room approval and double-book. Returns true when the room
-- was reclaimed, false when it is gone.
CREATE OR REPLACE FUNCTION reclaim_late_hotel_payment(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request daily_booking_requests%ROWTYPE;
  v_remaining INTEGER;
BEGIN
  SELECT * INTO v_request
  FROM daily_booking_requests
  WHERE id = p_request_id
  FOR UPDATE;

  -- Status whitelist, like the approve RPC: a declined/cancelled/refunded
  -- request must never be resurrected into a confirmed booking by a late
  -- payment callback.
  IF NOT FOUND
     OR v_request.room_type_id IS NULL
     OR v_request.status NOT IN
        ('approved_awaiting_payment', 'payment_pending', 'payment_expired')
  THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_request.room_type_id::text, 0));

  v_remaining := room_type_min_available(
    v_request.room_type_id,
    v_request.start_date::date,
    v_request.end_date::date,
    p_request_id
  );

  IF v_remaining IS NULL OR v_remaining <= 0 THEN
    RETURN false;
  END IF;

  UPDATE daily_booking_requests
  SET status = 'payment_pending',
      payment_expires_at = now() + interval '10 minutes'
  WHERE id = p_request_id
    AND status IN
        ('approved_awaiting_payment', 'payment_pending', 'payment_expired');

  RETURN true;
END;
$$;

COMMIT;
