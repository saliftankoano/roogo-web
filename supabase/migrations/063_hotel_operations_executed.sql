-- Hotel finance preferences used by the dedicated operations dashboard.

BEGIN;

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS payout_provider TEXT,
  ADD COLUMN IF NOT EXISTS payout_phone TEXT;

ALTER TABLE public.hotels
  DROP CONSTRAINT IF EXISTS hotels_payout_provider_check;

ALTER TABLE public.hotels
  ADD CONSTRAINT hotels_payout_provider_check
  CHECK (payout_provider IS NULL OR payout_provider IN ('ORANGE_BFA', 'MOOV_BFA'));

COMMENT ON COLUMN public.hotels.payout_provider IS
  'Default Mobile Money provider for hotel payouts; a payout still requires explicit confirmation.';
COMMENT ON COLUMN public.hotels.payout_phone IS
  'Default Burkina Faso national phone number (8 digits) for hotel payouts.';

CREATE INDEX IF NOT EXISTS idx_daily_booking_requests_hotel_analytics
  ON public.daily_booking_requests(property_id, start_date, status);

COMMIT;
