-- 054: Hotel commission rate and front-desk booking codes

BEGIN;

-- 7% commission charged to the hotel per reservation (regular journalier
-- stays keep daily_owner_commission_percentage, default 10%).
ALTER TABLE listing_config
  ADD COLUMN IF NOT EXISTS hotel_owner_commission_percentage NUMERIC NOT NULL DEFAULT 0.07
  CHECK (hotel_owner_commission_percentage >= 0 AND hotel_owner_commission_percentage <= 1);

-- Human-friendly code (RG-XXXXXX, Crockford base32) assigned at payment
-- confirmation; used for front-desk lookup and printed on receipts.
ALTER TABLE daily_booking_requests ADD COLUMN IF NOT EXISTS booking_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dbr_booking_code
  ON daily_booking_requests(booking_code)
  WHERE booking_code IS NOT NULL;

COMMIT;
