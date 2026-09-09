-- Sending is a durable, non-reclaimable boundary. A lost provider response or
-- outcome write is not evidence that another send is safe.
ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS send_started_at TIMESTAMPTZ;

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
