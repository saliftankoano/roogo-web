-- Prevent duplicate pending RCCM submissions per hotel.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_business_verifications_unique_pending
  ON public.hotel_business_verification_submissions(hotel_id)
  WHERE status = 'pending';

COMMIT;
