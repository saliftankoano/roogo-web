-- Follow-up to 069: safe for fresh installs and databases that already applied it.
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
