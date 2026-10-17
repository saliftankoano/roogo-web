-- Unapplied payment migrations consolidated on 2026-09-09.
-- Apply 070, 071, then 072 before deploying the payment backend.
-- Atomic reservation claims and finalization; completed history is immutable.
BEGIN;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS lock_payment_deposit_id TEXT,
  ADD COLUMN IF NOT EXISTS lock_payment_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS properties_lock_payment_deposit_idx
  ON public.properties(lock_payment_deposit_id)
  WHERE lock_payment_deposit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_direct_property_lock_payment(
  p_property_id UUID,
  p_deposit_id TEXT,
  p_hold_seconds INTEGER DEFAULT 1800
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed UUID;
BEGIN
  UPDATE public.properties
  SET
    lock_payment_deposit_id = p_deposit_id,
    lock_payment_expires_at = NOW() + make_interval(
      secs => GREATEST(COALESCE(p_hold_seconds, 1800), 60)
    )
  WHERE id = p_property_id
    AND status = 'en_ligne'
    AND (
      lock_payment_deposit_id IS NULL
      OR lock_payment_deposit_id = p_deposit_id
      OR lock_payment_expires_at < NOW()
    )
  RETURNING id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_direct_property_lock_payment(
  p_deposit_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released UUID;
BEGIN
  UPDATE public.properties
  SET lock_payment_deposit_id = NULL, lock_payment_expires_at = NULL
  WHERE lock_payment_deposit_id = p_deposit_id
  RETURNING id INTO v_released;
  RETURN v_released IS NOT NULL;
END;
$$;

-- A completed payment is historical evidence, not permission to reserve again.
CREATE OR REPLACE FUNCTION public.finalize_direct_property_lock(
  p_deposit_id TEXT,
  p_pawapay JSONB DEFAULT NULL
)
RETURNS TABLE (
  payment_status TEXT,
  failure_code TEXT,
  transitioned BOOLEAN,
  fulfillment_conflict BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_property_status TEXT;
  v_claim_deposit_id TEXT;
BEGIN
  SELECT *
  INTO v_transaction
  FROM public.transactions
  WHERE deposit_id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND OR v_transaction.type <> 'property_lock' THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, FALSE, FALSE;
    RETURN;
  END IF;

  IF v_transaction.status = 'failed' THEN
    RETURN QUERY
      SELECT 'failed'::TEXT, v_transaction.failure_code::TEXT, FALSE, FALSE;
    RETURN;
  END IF;

  IF v_transaction.status = 'completed' THEN
    -- New payments commit fulfillment and its marker atomically below. Older
    -- completed rows have no reliable evidence that fulfillment is unfinished.
    -- Never infer it from today's property status or mutate a newer reservation.
    RETURN QUERY SELECT 'completed'::TEXT, NULL::TEXT, FALSE,
      COALESCE(v_transaction.metadata ? 'propertyLockFinalizedAt', FALSE)
      AND COALESCE(v_transaction.metadata->>'propertyLockConflict' = 'true', FALSE);
    RETURN;
  END IF;

  IF v_transaction.status NOT IN ('pending', 'submitted') THEN
    RETURN QUERY
      SELECT v_transaction.status::TEXT, v_transaction.failure_code::TEXT, FALSE, FALSE;
    RETURN;
  END IF;

  SELECT status, lock_payment_deposit_id
  INTO v_property_status, v_claim_deposit_id
  FROM public.properties
  WHERE id = v_transaction.property_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property % not found for deposit %',
      v_transaction.property_id, p_deposit_id;
  END IF;

  IF v_property_status <> 'en_ligne'
     OR (v_claim_deposit_id IS NOT NULL AND v_claim_deposit_id <> p_deposit_id) THEN
    UPDATE public.transactions
    SET
      status = 'completed',
      metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
        'pawapay', p_pawapay,
        'propertyLockFinalizedAt', NOW(),
        'propertyLockConflict', TRUE,
        'propertyLockConflictAt', NOW()
      ),
      updated_at = NOW()
    WHERE id = v_transaction.id;
    RETURN QUERY SELECT 'completed'::TEXT, NULL::TEXT, FALSE, TRUE;
    RETURN;
  END IF;

  UPDATE public.properties
  SET
    status = 'locked',
    lock_payment_deposit_id = NULL,
    lock_payment_expires_at = NULL
  WHERE id = v_transaction.property_id;

  UPDATE public.transactions
  SET
    status = 'completed',
    metadata = COALESCE(metadata, '{}'::JSONB) ||
      CASE
        WHEN p_pawapay IS NULL THEN '{}'::JSONB
        ELSE jsonb_build_object('pawapay', p_pawapay)
      END || jsonb_build_object('propertyLockFinalizedAt', NOW()),
    updated_at = NOW()
  WHERE id = v_transaction.id;

  RETURN QUERY SELECT 'completed'::TEXT, NULL::TEXT, TRUE, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_direct_property_lock(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_direct_property_lock(TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.claim_direct_property_lock_payment(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_direct_property_lock_payment(UUID, TEXT, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_direct_property_lock_payment(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_direct_property_lock_payment(TEXT)
  TO service_role;

COMMIT;
