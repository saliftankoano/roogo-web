-- Founder-configurable owner commission for daily rental bookings.

ALTER TABLE public.listing_config
  ADD COLUMN IF NOT EXISTS daily_owner_commission_percentage NUMERIC DEFAULT 0.10;

UPDATE public.listing_config
SET daily_owner_commission_percentage = 0.10
WHERE daily_owner_commission_percentage IS NULL;

ALTER TABLE public.listing_config
  ALTER COLUMN daily_owner_commission_percentage SET DEFAULT 0.10,
  ALTER COLUMN daily_owner_commission_percentage SET NOT NULL;

ALTER TABLE public.listing_config
  DROP CONSTRAINT IF EXISTS valid_daily_owner_commission;

ALTER TABLE public.listing_config
  ADD CONSTRAINT valid_daily_owner_commission
  CHECK (
    daily_owner_commission_percentage >= 0
    AND daily_owner_commission_percentage <= 1
  );
