-- 059: Staff/founder import of an already-signed monthly lease.

BEGIN;

ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS signature_source TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.rental_agreements
  DROP CONSTRAINT IF EXISTS rental_agreements_signature_source_check,
  ADD CONSTRAINT rental_agreements_signature_source_check
    CHECK (signature_source IN ('in_app', 'offline_import'));

ALTER TABLE public.rent_schedules
  ADD COLUMN IF NOT EXISTS payment_source TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.rent_schedules
  DROP CONSTRAINT IF EXISTS rent_schedules_payment_source_check,
  ADD CONSTRAINT rent_schedules_payment_source_check
    CHECK (payment_source IN ('platform', 'offline_import'));

CREATE TABLE IF NOT EXISTS public.rental_agreement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL UNIQUE REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  renter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  imported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  external_signed_at DATE NOT NULL,
  signed_document_paths JSONB NOT NULL,
  rent_months_paid INTEGER NOT NULL DEFAULT 0 CHECK (rent_months_paid >= 0),
  offline_rent_amount INTEGER NOT NULL DEFAULT 0 CHECK (offline_rent_amount >= 0),
  caution_amount INTEGER NOT NULL DEFAULT 0 CHECK (caution_amount >= 0),
  payment_date DATE,
  payment_method TEXT,
  payment_reference TEXT,
  commission_amount INTEGER NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  commission_date DATE,
  commission_method TEXT,
  commission_reference TEXT,
  previous_property_status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rental_import_documents_array CHECK (
    jsonb_typeof(signed_document_paths) = 'array'
    AND jsonb_array_length(signed_document_paths) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_rental_imports_property
  ON public.rental_agreement_imports(property_id);
CREATE INDEX IF NOT EXISTS idx_rental_imports_renter
  ON public.rental_agreement_imports(renter_id);

ALTER TABLE public.rental_agreement_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_agreement_imports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rental_agreement_imports TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rental-agreement-imports',
  'rental-agreement-imports',
  FALSE,
  15728640,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.import_existing_monthly_lease(
  p_property_id UUID,
  p_renter_id UUID,
  p_imported_by UUID,
  p_monthly_rent INTEGER,
  p_caution_mois INTEGER,
  p_start_date DATE,
  p_end_date DATE,
  p_external_signed_at DATE,
  p_signed_document_paths JSONB,
  p_rent_months_paid INTEGER,
  p_caution_amount INTEGER,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_payment_reference TEXT,
  p_commission_amount INTEGER,
  p_commission_date DATE,
  p_commission_method TEXT,
  p_commission_reference TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(agreement_id UUID, import_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property public.properties%ROWTYPE;
  v_importer_type TEXT;
  v_owner_type TEXT;
  v_renter_type TEXT;
  v_agreement_id UUID;
  v_import_id UUID;
  v_end_date DATE;
  v_schedule_count INTEGER;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_property_id::TEXT));

  SELECT user_type INTO v_importer_type FROM public.users WHERE id = p_imported_by;
  IF v_importer_type IS NULL OR v_importer_type NOT IN ('staff', 'founder') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_property FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_property.listing_type <> 'louer' OR v_property.period = 'day' OR v_property.frequence = 'journalier' THEN
    RAISE EXCEPTION 'not_monthly_rental' USING ERRCODE = 'P0001';
  END IF;
  IF v_property.status <> 'en_ligne' THEN
    RAISE EXCEPTION 'property_not_available' USING ERRCODE = 'P0001';
  END IF;
  IF v_property.agent_id IS NULL THEN RAISE EXCEPTION 'owner_missing' USING ERRCODE = 'P0001'; END IF;

  SELECT user_type INTO v_owner_type FROM public.users WHERE id = v_property.agent_id;
  IF v_owner_type IS NULL OR v_owner_type NOT IN ('owner', 'agent') THEN
    RAISE EXCEPTION 'owner_missing' USING ERRCODE = 'P0001';
  END IF;
  SELECT user_type INTO v_renter_type FROM public.users WHERE id = p_renter_id;
  IF v_renter_type IS NULL THEN RAISE EXCEPTION 'renter_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_renter_type <> 'renter' THEN RAISE EXCEPTION 'invalid_renter_type' USING ERRCODE = 'P0001'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.rental_agreements
    WHERE property_id = p_property_id
      AND property_frequence <> 'journalier'
      AND status IN ('draft', 'sent', 'renter_signed', 'owner_signed', 'active')
  ) THEN
    RAISE EXCEPTION 'active_agreement_exists' USING ERRCODE = 'P0001';
  END IF;

  IF p_monthly_rent <= 0 OR p_caution_mois NOT BETWEEN 0 AND 12
    OR p_rent_months_paid < 0
    OR p_caution_amount < 0 OR p_commission_amount < 0
    OR ((p_rent_months_paid > 0 OR p_caution_amount > 0)
      AND (p_payment_date IS NULL OR NULLIF(trim(p_payment_method), '') IS NULL))
    OR (p_commission_amount > 0
      AND (p_commission_date IS NULL OR NULLIF(trim(p_commission_method), '') IS NULL)) THEN
    RAISE EXCEPTION 'invalid_offline_amounts' USING ERRCODE = 'P0001';
  END IF;
  IF p_start_date IS NULL OR p_external_signed_at IS NULL
    OR (p_end_date IS NOT NULL AND p_end_date <= p_start_date) THEN
    RAISE EXCEPTION 'invalid_lease_dates' USING ERRCODE = 'P0001';
  END IF;
  IF p_signed_document_paths IS NULL
    OR jsonb_typeof(p_signed_document_paths) <> 'array'
    OR jsonb_array_length(p_signed_document_paths) = 0 THEN
    RAISE EXCEPTION 'document_required' USING ERRCODE = 'P0001';
  END IF;

  v_end_date := COALESCE(p_end_date, (p_start_date + INTERVAL '12 months')::DATE);
  v_schedule_count := GREATEST(1,
    (EXTRACT(YEAR FROM age(v_end_date, p_start_date))::INTEGER * 12)
    + EXTRACT(MONTH FROM age(v_end_date, p_start_date))::INTEGER
    + CASE
        WHEN (
          p_start_date
          + (
              (EXTRACT(YEAR FROM age(v_end_date, p_start_date))::INTEGER * 12)
              + EXTRACT(MONTH FROM age(v_end_date, p_start_date))::INTEGER
            ) * INTERVAL '1 month'
        )::DATE < v_end_date THEN 1
        ELSE 0
      END
  );
  IF p_rent_months_paid > v_schedule_count THEN
    RAISE EXCEPTION 'invalid_offline_amounts' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rental_agreements (
    property_id, owner_id, renter_id, status, monthly_rent, caution_mois,
    loyer_avance_mois, dos_and_donts, interdictions, terms_text,
    start_date, end_date, owner_signed_at, renter_signed_at,
    property_frequence, signature_source, imported_at, imported_by
  ) VALUES (
    p_property_id, v_property.agent_id, p_renter_id, 'active', p_monthly_rent,
    p_caution_mois, GREATEST(1, p_rent_months_paid),
    COALESCE(v_property.dos_and_donts, '{}'), '{}',
    'Bail signé hors ligne et importé par Roogo.', p_start_date, p_end_date,
    p_external_signed_at::TIMESTAMPTZ, p_external_signed_at::TIMESTAMPTZ,
    'mensuel', 'offline_import', v_now, p_imported_by
  ) RETURNING id INTO v_agreement_id;

  INSERT INTO public.rent_schedules (
    agreement_id, property_id, renter_id, owner_id, due_date, amount,
    status, transaction_id, paid_at, payment_source, recorded_by
  )
  SELECT
    v_agreement_id, p_property_id, p_renter_id, v_property.agent_id,
    (p_start_date + (series.i || ' months')::INTERVAL)::DATE,
    p_monthly_rent,
    CASE WHEN series.i < p_rent_months_paid THEN 'paid' ELSE 'upcoming' END,
    NULL,
    CASE WHEN series.i < p_rent_months_paid THEN p_payment_date::TIMESTAMPTZ ELSE NULL END,
    CASE WHEN series.i < p_rent_months_paid THEN 'offline_import' ELSE 'platform' END,
    CASE WHEN series.i < p_rent_months_paid THEN p_imported_by ELSE NULL END
  FROM generate_series(0, v_schedule_count - 1) AS series(i);

  INSERT INTO public.rental_agreement_imports (
    agreement_id, property_id, owner_id, renter_id, imported_by,
    external_signed_at, signed_document_paths, rent_months_paid,
    offline_rent_amount, caution_amount, payment_date, payment_method,
    payment_reference, commission_amount, commission_date, commission_method,
    commission_reference, previous_property_status, notes
  ) VALUES (
    v_agreement_id, p_property_id, v_property.agent_id, p_renter_id, p_imported_by,
    p_external_signed_at, p_signed_document_paths, p_rent_months_paid,
    p_monthly_rent * p_rent_months_paid, p_caution_amount, p_payment_date,
    NULLIF(trim(p_payment_method), ''), NULLIF(trim(p_payment_reference), ''),
    p_commission_amount, p_commission_date, NULLIF(trim(p_commission_method), ''),
    NULLIF(trim(p_commission_reference), ''), v_property.status, NULLIF(trim(p_notes), '')
  ) RETURNING id INTO v_import_id;

  UPDATE public.properties SET status = 'locked', updated_at = v_now WHERE id = p_property_id;

  RETURN QUERY SELECT v_agreement_id, v_import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_existing_monthly_lease(
  UUID, UUID, UUID, INTEGER, INTEGER, DATE, DATE, DATE, JSONB, INTEGER,
  INTEGER, DATE, TEXT, TEXT, INTEGER, DATE, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_existing_monthly_lease(
  UUID, UUID, UUID, INTEGER, INTEGER, DATE, DATE, DATE, JSONB, INTEGER,
  INTEGER, DATE, TEXT, TEXT, INTEGER, DATE, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
