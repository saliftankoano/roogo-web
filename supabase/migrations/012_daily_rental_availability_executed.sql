-- Migration: Daily Rental Availability
-- Adds property_blocked_dates table for owner-managed availability
-- and property_frequence column to rental_agreements for display purposes.

-- 1. New blocked-dates table
CREATE TABLE IF NOT EXISTS property_blocked_dates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  block_type   TEXT NOT NULL DEFAULT 'owner_block', -- 'owner_block' | 'booked'
  agreement_id UUID REFERENCES rental_agreements(id) ON DELETE SET NULL,
  note         TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_blocked_dates_property_dates
  ON property_blocked_dates (property_id, start_date, end_date);

-- RLS: anyone can read availability; inserts/deletes are done via service-role API
ALTER TABLE property_blocked_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_blocked_dates"
  ON property_blocked_dates FOR SELECT
  USING (true);

-- 2. Add frequence context to rental_agreements so agreement-detail can
--    display correct labels without an extra join.
ALTER TABLE rental_agreements
  ADD COLUMN IF NOT EXISTS property_frequence TEXT NOT NULL DEFAULT 'mensuel';
