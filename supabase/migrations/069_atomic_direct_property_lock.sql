-- Complete a direct monthly property payment and lock the property in one
-- database transaction. External callbacks can race the initiating request;
-- the returned transition flag assigns success side effects to one caller.
CREATE OR REPLACE FUNCTION public.finalize_direct_property_lock(
  p_deposit_id TEXT,
  p_pawapay JSONB DEFAULT NULL
)
RETURNS TABLE (
  payment_status TEXT,
  failure_code TEXT,
  transitioned BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_transaction
  FROM public.transactions
  WHERE deposit_id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND OR v_transaction.type <> 'property_lock' THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  IF v_transaction.status = 'failed' THEN
    RETURN QUERY
      SELECT 'failed'::TEXT, v_transaction.failure_code::TEXT, FALSE;
    RETURN;
  END IF;

  IF v_transaction.status = 'completed' THEN
    -- A callback may have won immediately before this request. Ensure the
    -- current property is locked, but do not claim its completion side effects.
    UPDATE public.properties
    SET status = 'locked'
    WHERE id = v_transaction.property_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Property % not found for deposit %',
        v_transaction.property_id, p_deposit_id;
    END IF;

    RETURN QUERY SELECT 'completed'::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  IF v_transaction.status NOT IN ('pending', 'submitted') THEN
    RETURN QUERY
      SELECT v_transaction.status::TEXT, v_transaction.failure_code::TEXT, FALSE;
    RETURN;
  END IF;

  UPDATE public.properties
  SET status = 'locked'
  WHERE id = v_transaction.property_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property % not found for deposit %',
      v_transaction.property_id, p_deposit_id;
  END IF;

  UPDATE public.transactions
  SET
    status = 'completed',
    metadata = COALESCE(metadata, '{}'::JSONB) ||
      CASE
        WHEN p_pawapay IS NULL THEN '{}'::JSONB
        ELSE jsonb_build_object('pawapay', p_pawapay)
      END,
    updated_at = NOW()
  WHERE id = v_transaction.id;

  RETURN QUERY SELECT 'completed'::TEXT, NULL::TEXT, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_direct_property_lock(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_direct_property_lock(TEXT, JSONB)
  TO service_role;
