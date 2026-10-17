BEGIN;

CREATE OR REPLACE FUNCTION public.waive_owner_sourced_listing_success_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  IF NEW.property_frequence IS DISTINCT FROM 'mensuel'
    OR NEW.application_id IS NOT NULL
    OR NEW.transaction_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_reason := CASE
    WHEN NEW.signature_source = 'offline_import' THEN 'offline_lease_import'
    ELSE 'owner_sourced_renter'
  END;

  UPDATE public.property_listing_fees
  SET
    status = 'waived',
    metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
      'waiver_reason', v_reason,
      'waived_for_agreement_id', NEW.id,
      'waived_at', NOW()
    ),
    updated_at = NOW()
  WHERE property_id = NEW.property_id
    AND owner_id = NEW.owner_id
    AND fee_type = 'success_fee'
    AND status = 'pending';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waive_owner_sourced_listing_success_fee
  ON public.rental_agreements;
CREATE TRIGGER waive_owner_sourced_listing_success_fee
  AFTER INSERT ON public.rental_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.waive_owner_sourced_listing_success_fee();

COMMENT ON FUNCTION public.waive_owner_sourced_listing_success_fee() IS
  'Waives a pending no-upfront listing fee when the renter came from an owner-created or imported agreement rather than a Roogo application/payment.';

REVOKE ALL ON FUNCTION public.waive_owner_sourced_listing_success_fee()
  FROM PUBLIC, anon, authenticated;

COMMIT;
