BEGIN;

CREATE TABLE public.property_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, description TEXT NOT NULL,
  listing_type TEXT NOT NULL CHECK (listing_type IN ('vendre', 'louer')),
  property_type TEXT NOT NULL, city TEXT NOT NULL, neighborhood TEXT NOT NULL DEFAULT '',
  budget_min BIGINT CHECK (budget_min > 0), budget_max BIGINT NOT NULL CHECK (budget_max > 0),
  min_area NUMERIC CHECK (min_area > 0), min_bedrooms INTEGER CHECK (min_bedrooms >= 0),
  commission_rate NUMERIC(5,2) NOT NULL CHECK (commission_rate > 0 AND commission_rate <= 100),
  commission_terms TEXT NOT NULL,
  customer_name TEXT NOT NULL, customer_contact TEXT NOT NULL, internal_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (budget_min IS NULL OR budget_min <= budget_max)
);

CREATE TABLE public.property_request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.property_requests(id) ON DELETE RESTRICT,
  respondent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  respondent_role TEXT NOT NULL CHECK (respondent_role IN ('owner', 'agent')),
  property_type TEXT NOT NULL, city TEXT NOT NULL, neighborhood TEXT NOT NULL, address TEXT NOT NULL,
  asking_price BIGINT NOT NULL CHECK (asking_price > 0), area NUMERIC NOT NULL CHECK (area > 0),
  bedrooms INTEGER NOT NULL CHECK (bedrooms >= 0), bathrooms INTEGER NOT NULL CHECK (bathrooms >= 0),
  description TEXT NOT NULL, document_types TEXT[] NOT NULL CHECK (cardinality(document_types) > 0),
  document_notes TEXT NOT NULL DEFAULT '', contact_phone TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 10),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','contacted','accepted','listed','rejected')),
  commission_rate NUMERIC(5,2) NOT NULL, commission_terms TEXT NOT NULL,
  commission_basis TEXT NOT NULL CHECK (commission_basis IN ('sale_price','monthly_rent')),
  terms_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  commission_confirmed_at TIMESTAMPTZ, commission_confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  staff_notes TEXT NOT NULL DEFAULT '', property_id UUID REFERENCES public.properties(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, respondent_id),
  CHECK (status <> 'listed' OR property_id IS NOT NULL)
);

CREATE INDEX property_requests_status_created_idx ON public.property_requests(status, created_at DESC);
CREATE INDEX property_request_responses_respondent_idx ON public.property_request_responses(respondent_id, created_at DESC);
CREATE TRIGGER property_requests_updated BEFORE UPDATE ON public.property_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER property_request_responses_updated BEFORE UPDATE ON public.property_request_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.property_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_request_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_requests, public.property_request_responses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.property_requests, public.property_request_responses TO service_role;

-- Serialize submission against edits/closure. A retry returns the original receipt,
-- never overwrites property details or the terms acknowledged by the respondent.
CREATE FUNCTION public.submit_property_request_response(p_request_id UUID, p_user_id UUID, p_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.property_requests%ROWTYPE;
  v_response public.property_request_responses%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT user_type INTO v_role FROM public.users WHERE id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'agent') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;
  SELECT * INTO v_request FROM public.property_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  SELECT * INTO v_response FROM public.property_request_responses
    WHERE request_id = p_request_id AND respondent_id = p_user_id;
  IF FOUND THEN RETURN jsonb_build_object('id', v_response.id, 'existing', true); END IF;
  IF v_request.status <> 'open' THEN RETURN jsonb_build_object('error', 'closed'); END IF;
  IF (p_input->>'terms_accepted')::boolean IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('error', 'terms_required');
  END IF;
  IF (p_input->>'request_updated_at')::timestamptz IS DISTINCT FROM v_request.updated_at THEN
    RETURN jsonb_build_object('error', 'terms_changed');
  END IF;
  INSERT INTO public.property_request_responses (
    request_id, respondent_id, respondent_role, property_type, city, neighborhood, address,
    asking_price, area, bedrooms, bathrooms, description, document_types, document_notes,
    contact_phone, attachments, commission_rate, commission_terms, commission_basis
  ) VALUES (
    p_request_id, p_user_id, v_role, p_input->>'property_type', p_input->>'city', p_input->>'neighborhood', p_input->>'address',
    (p_input->>'asking_price')::bigint, (p_input->>'area')::numeric, (p_input->>'bedrooms')::integer,
    (p_input->>'bathrooms')::integer, p_input->>'description',
    ARRAY(SELECT jsonb_array_elements_text(p_input->'document_types')), coalesce(p_input->>'document_notes', ''),
    p_input->>'contact_phone', coalesce(p_input->'attachments', '[]'::jsonb),
    CASE WHEN v_role = 'agent' THEN v_request.commission_rate ELSE 0 END,
    v_request.commission_terms, CASE WHEN v_request.listing_type = 'vendre' THEN 'sale_price' ELSE 'monthly_rent' END
  ) RETURNING * INTO v_response;
  RETURN jsonb_build_object('id', v_response.id, 'existing', false);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_property_request_response(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_property_request_response(UUID, UUID, JSONB) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property-request-files', 'property-request-files', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']);
-- No client storage policies: signed uploads and short-lived reads are issued by authenticated APIs.
COMMIT;
