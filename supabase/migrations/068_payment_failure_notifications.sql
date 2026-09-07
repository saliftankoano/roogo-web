-- Persist customer-safe payment failure codes and make failed-payment
-- notifications idempotent across initiate, polling, and webhook races.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS failure_code TEXT;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_failure_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_payer_phone TEXT;

ALTER TABLE public.notification_deliveries
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_cooldown_key TEXT,
  ADD COLUMN IF NOT EXISTS sms_claimed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_payment_failure_unique
  ON public.notification_deliveries(event_type, subject_id)
  WHERE event_type = 'payments.failed';

CREATE INDEX IF NOT EXISTS notification_deliveries_payment_failure_sms_cooldown_idx
  ON public.notification_deliveries(
    sms_cooldown_key,
    sms_claimed_at DESC
  )
  WHERE event_type = 'payments.failed'
    AND sms_cooldown_key IS NOT NULL;

-- Claim one retryable delivery lease per deposit. A failed attempt, or a worker
-- that disappeared after its lease expired, can be reclaimed by a later
-- webhook/poll while concurrent workers remain deduplicated.
CREATE OR REPLACE FUNCTION public.claim_payment_failure_delivery(
  p_user_id UUID,
  p_notification_type TEXT,
  p_event_type TEXT,
  p_subject_id TEXT,
  p_metadata JSONB,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id UUID;
BEGIN
  INSERT INTO public.notification_deliveries (
    user_id,
    notification_type,
    event_type,
    subject_id,
    metadata,
    delivery_status,
    lease_expires_at,
    attempt_count
  )
  VALUES (
    p_user_id,
    p_notification_type,
    p_event_type,
    p_subject_id,
    COALESCE(p_metadata, '{}'::jsonb),
    'pending',
    NOW() + make_interval(secs => GREATEST(p_lease_seconds, 1)),
    1
  )
  ON CONFLICT (event_type, subject_id)
    WHERE event_type = 'payments.failed'
  DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, notification_deliveries.user_id),
    notification_type = EXCLUDED.notification_type,
    metadata = EXCLUDED.metadata,
    delivery_status = 'pending',
    lease_expires_at = EXCLUDED.lease_expires_at,
    attempt_count = notification_deliveries.attempt_count + 1
  WHERE (
       notification_deliveries.delivery_status = 'failed'
       AND COALESCE(notification_deliveries.lease_expires_at, '-infinity') < NOW()
     )
     OR (
       notification_deliveries.delivery_status = 'pending'
       AND notification_deliveries.lease_expires_at < NOW()
     )
  RETURNING id INTO claimed_id;

  RETURN claimed_id IS NOT NULL;
END;
$$;

-- Serialize claims for a phone/failure-code pair. Recording the claim before
-- the external send closes the read-then-send race between different deposits.
CREATE OR REPLACE FUNCTION public.claim_payment_failure_sms_cooldown(
  p_subject_id TEXT,
  p_cooldown_key TEXT,
  p_since TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cooldown_key, 0));

  IF EXISTS (
    SELECT 1
    FROM public.notification_deliveries
    WHERE event_type = 'payments.failed'
      AND subject_id <> p_subject_id
      AND sms_cooldown_key = p_cooldown_key
      AND sms_claimed_at >= p_since
      AND delivery_status IN ('pending', 'sent')
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.notification_deliveries
  SET
    sms_cooldown_key = p_cooldown_key,
    sms_claimed_at = NOW()
  WHERE event_type = 'payments.failed'
    AND subject_id = p_subject_id
    AND delivery_status = 'pending';

  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_failure_delivery(
  UUID, TEXT, TEXT, TEXT, JSONB, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_failure_delivery(
  UUID, TEXT, TEXT, TEXT, JSONB, INTEGER
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_payment_failure_sms_cooldown(
  TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_failure_sms_cooldown(
  TEXT, TEXT, TIMESTAMPTZ
) TO service_role;
