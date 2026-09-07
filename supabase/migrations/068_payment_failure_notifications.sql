-- Persist customer-safe payment failure codes and make failed-payment
-- notifications idempotent across initiate, polling, and webhook races.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS failure_code TEXT;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_failure_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_payer_phone TEXT;

ALTER TABLE public.notification_deliveries
  ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_payment_failure_unique
  ON public.notification_deliveries(event_type, subject_id)
  WHERE event_type = 'payments.failed';

CREATE INDEX IF NOT EXISTS notification_deliveries_payment_failure_sms_cooldown_idx
  ON public.notification_deliveries(
    (metadata ->> 'phoneHash'),
    (metadata ->> 'failureCode'),
    sent_at DESC
  )
  WHERE event_type = 'payments.failed'
    AND metadata @> '{"smsSent": true}'::jsonb;
