-- Unapplied payment migrations consolidated on 2026-09-09.
-- Apply 070, 071, then 072 before deploying the payment backend.
-- Failure fields and duplicate-safe payment notification delivery.
BEGIN;

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
  ADD COLUMN IF NOT EXISTS sms_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_started_at TIMESTAMPTZ;

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

-- Retryable delivery claims for other payment-critical alerts. Unlike the
-- accountless payment-failure index above, these deliveries always belong to
-- a user and use the table's original per-user event uniqueness guarantee.
CREATE OR REPLACE FUNCTION public.claim_retryable_notification_delivery(
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
    NOW() + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 300), 1)),
    1
  )
  ON CONFLICT (user_id, event_type, subject_id)
  DO UPDATE SET
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

REVOKE ALL ON FUNCTION public.claim_payment_failure_delivery(
  UUID, TEXT, TEXT, TEXT, JSONB, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_failure_delivery(
  UUID, TEXT, TEXT, TEXT, JSONB, INTEGER
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_retryable_notification_delivery(
  UUID, TEXT, TEXT, TEXT, JSONB, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_retryable_notification_delivery(
  UUID, TEXT, TEXT, TEXT, JSONB, INTEGER
) TO service_role;

-- Pre-boundary workers did not record whether their provider call started.
-- Preserve that uncertainty instead of reclaiming a possibly accepted send.
UPDATE public.notification_deliveries
SET delivery_status = 'uncertain'
WHERE event_type = 'payments.failed' AND delivery_status = 'pending'
  AND NOT (COALESCE(metadata, '{}'::JSONB) ? 'deliveryAttemptId');

CREATE OR REPLACE FUNCTION public.begin_payment_failure_send(
  p_subject_id TEXT, p_attempt_id UUID, p_channel TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed_count INTEGER;
BEGIN
  IF p_channel NOT IN ('sms', 'push') THEN RETURN FALSE; END IF;
  UPDATE public.notification_deliveries
  SET delivery_status = 'sending', send_started_at = NOW(),
      metadata = metadata || jsonb_build_object('channel', p_channel)
  WHERE event_type = 'payments.failed' AND subject_id = p_subject_id
    AND delivery_status = 'pending' AND lease_expires_at > NOW()
    AND metadata->>'deliveryAttemptId' = p_attempt_id::TEXT;
  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_payment_failure_send(TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_payment_failure_send(TEXT, UUID, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_payment_failure_sms_cooldown(
  p_subject_id TEXT, p_cooldown_key TEXT, p_since TIMESTAMPTZ
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cooldown_key, 0));
  IF EXISTS (
    SELECT 1 FROM public.notification_deliveries
    WHERE event_type = 'payments.failed' AND subject_id <> p_subject_id
      AND sms_cooldown_key = p_cooldown_key AND sms_claimed_at >= p_since
      AND delivery_status IN ('pending', 'sending', 'uncertain', 'sent')
  ) THEN RETURN FALSE; END IF;
  UPDATE public.notification_deliveries
  SET sms_cooldown_key = p_cooldown_key, sms_claimed_at = NOW()
  WHERE event_type = 'payments.failed' AND subject_id = p_subject_id
    AND delivery_status = 'pending';
  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_failure_sms_cooldown(TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_failure_sms_cooldown(TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

-- Fence cooldown writes too: a stale worker must not change the newer
-- attempt's phone/code claim. Keep the advisory-lock -> row-lock order.
CREATE OR REPLACE FUNCTION public.claim_payment_failure_sms_cooldown_attempt(
  p_subject_id TEXT, p_cooldown_key TEXT, p_since TIMESTAMPTZ, p_attempt_id UUID
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cooldown_key, 0));
  PERFORM 1 FROM public.notification_deliveries
  WHERE event_type = 'payments.failed' AND subject_id = p_subject_id
    AND delivery_status = 'pending' AND lease_expires_at > NOW()
    AND metadata->>'deliveryAttemptId' = p_attempt_id::TEXT
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN public.claim_payment_failure_sms_cooldown(p_subject_id, p_cooldown_key, p_since);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_payment_failure_sms_cooldown_attempt(TEXT, TEXT, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_failure_sms_cooldown_attempt(TEXT, TEXT, TIMESTAMPTZ, UUID)
  TO service_role;

-- Drain older conflict-notification workers before applying this migration.
-- Their boolean sender could not distinguish rejection from a lost response.
-- Neither legacy pending nor legacy failed attempts are safe to resend.
UPDATE public.notification_deliveries
SET delivery_status = 'uncertain', lease_expires_at = NULL
WHERE event_type = 'payments.property_lock_conflict'
  AND delivery_status IN ('pending', 'failed')
  AND NOT (COALESCE(metadata, '{}'::JSONB) ? 'deliveryAttemptId');

CREATE OR REPLACE FUNCTION public.begin_retryable_notification_send(
  p_user_id UUID, p_event_type TEXT, p_subject_id TEXT, p_attempt_id UUID
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed_count INTEGER;
BEGIN
  IF p_event_type <> 'payments.property_lock_conflict' THEN RETURN FALSE; END IF;
  UPDATE public.notification_deliveries
  SET delivery_status = 'sending', send_started_at = NOW(),
      metadata = metadata || jsonb_build_object('channel', 'push')
  WHERE user_id = p_user_id AND event_type = p_event_type AND subject_id = p_subject_id
    AND delivery_status = 'pending' AND lease_expires_at > NOW()
    AND metadata->>'deliveryAttemptId' = p_attempt_id::TEXT;
  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_retryable_notification_send(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_retryable_notification_send(UUID, TEXT, TEXT, UUID)
  TO service_role;

COMMIT;
