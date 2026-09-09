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
