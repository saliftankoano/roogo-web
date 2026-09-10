-- Unapplied payment migrations consolidated on 2026-09-09.
-- Apply 070, 071, then 072 before deploying the payment backend.
-- Single-use listing deposits, deletion-proof history and atomic amenities.
-- Preflight duplicate deposits and contradictory historical property links.
BEGIN;
LOCK TABLE public.properties IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.transactions IN SHARE ROW EXCLUSIVE MODE;

-- A hosted listing payment can fund at most one property. This closes both
-- concurrent submission races and stale browser/deep-link replay.
CREATE UNIQUE INDEX IF NOT EXISTS properties_payment_id_unique
  ON public.properties(payment_id)
  WHERE payment_id IS NOT NULL;

-- A property may be deleted, but that must not restore its paid listing credit.

CREATE TABLE public.listing_payment_consumptions (
  deposit_id TEXT PRIMARY KEY,
  -- Intentionally no property FK: this is immutable consumption history.
  property_id UUID NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.listing_payment_consumptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_payment_consumptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.listing_payment_consumptions TO service_role;

-- UNION deduplicates matching evidence. Conflicting historical links fail the
-- migration instead of silently choosing which property consumed the deposit.
INSERT INTO public.listing_payment_consumptions (deposit_id, property_id)
SELECT payment_id, id FROM public.properties WHERE payment_id IS NOT NULL
UNION
SELECT deposit_id, property_id FROM public.transactions
WHERE type = 'listing_submission' AND deposit_id IS NOT NULL
  AND property_id IS NOT NULL;

CREATE FUNCTION public.consume_listing_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing_property UUID;
BEGIN
  IF NEW.payment_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.payment_id IS NOT DISTINCT FROM OLD.payment_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.listing_payment_consumptions(deposit_id, property_id)
  VALUES (NEW.payment_id, NEW.id)
  ON CONFLICT (deposit_id) DO NOTHING;
  IF FOUND THEN RETURN NEW; END IF;
  SELECT property_id INTO existing_property FROM public.listing_payment_consumptions
  WHERE deposit_id = NEW.payment_id;
  -- Reattaching the reference to its still-existing property is idempotent.
  -- Recreating even the same UUID after deletion is not a new payment credit.
  IF TG_OP = 'UPDATE' AND existing_property = NEW.id THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Listing payment has already been consumed'
    USING ERRCODE = '23505', CONSTRAINT = 'listing_payment_consumptions_pkey';
END;
$$;
REVOKE ALL ON FUNCTION public.consume_listing_payment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER consume_listing_payment
AFTER INSERT OR UPDATE OF payment_id ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.consume_listing_payment();

-- Capture creation-time amenities in the same transaction as the property and
-- its payment-consumption record. Older writers omit this nullable snapshot.
ALTER TABLE public.properties ADD COLUMN creation_amenity_names TEXT[];

CREATE FUNCTION public.attach_creation_amenities()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.property_amenities(property_id, amenity_id)
  SELECT NEW.id, amenity.id
  FROM public.amenities AS amenity
  WHERE amenity.name = ANY(NEW.creation_amenity_names);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_creation_amenities() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER attach_creation_amenities
AFTER INSERT ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.attach_creation_amenities();

COMMIT;
