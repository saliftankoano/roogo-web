-- Booking-scoped hotel chat and RCCM business verification.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hotel-business-documents',
  'hotel-business-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS business_verification_status TEXT NOT NULL DEFAULT 'unsubmitted',
  ADD COLUMN IF NOT EXISTS business_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS business_verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_verification_rejection_reason TEXT;

ALTER TABLE public.hotels
  DROP CONSTRAINT IF EXISTS hotels_business_verification_status_check;
ALTER TABLE public.hotels
  ADD CONSTRAINT hotels_business_verification_status_check
  CHECK (business_verification_status IN ('unsubmitted', 'pending', 'approved', 'rejected'));

CREATE TABLE IF NOT EXISTS public.hotel_business_verification_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  rccm_number TEXT NOT NULL,
  tax_number TEXT,
  document_storage_path TEXT NOT NULL,
  document_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_business_verifications_status
  ON public.hotel_business_verification_submissions(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_business_verifications_hotel
  ON public.hotel_business_verification_submissions(hotel_id, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_business_verifications_one_pending
  ON public.hotel_business_verification_submissions(hotel_id)
  WHERE status = 'pending';

ALTER TABLE public.hotel_business_verification_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hotel admins view business verification submissions"
  ON public.hotel_business_verification_submissions FOR SELECT
  USING (current_user_hotel_role(hotel_id) = 'admin');

CREATE OR REPLACE FUNCTION submit_hotel_business_verification(
  p_hotel_id UUID,
  p_submitted_by UUID,
  p_legal_name TEXT,
  p_rccm_number TEXT,
  p_tax_number TEXT,
  p_document_storage_path TEXT,
  p_document_mime_type TEXT
) RETURNS SETOF public.hotel_business_verification_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission public.hotel_business_verification_submissions%ROWTYPE;
  v_hotel_status TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_hotel_id::text, 0));

  SELECT business_verification_status INTO v_hotel_status
  FROM public.hotels
  WHERE id = p_hotel_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_hotel_status = 'approved' THEN
    RAISE EXCEPTION 'HOTEL_ALREADY_VERIFIED';
  END IF;

  UPDATE public.hotel_business_verification_submissions
  SET status = 'rejected',
      reviewed_at = now(),
      rejection_reason = 'Remplacé par une nouvelle soumission.',
      updated_at = now()
  WHERE hotel_id = p_hotel_id AND status = 'pending';

  INSERT INTO public.hotel_business_verification_submissions (
    hotel_id,
    submitted_by,
    legal_name,
    rccm_number,
    tax_number,
    document_storage_path,
    document_mime_type
  ) VALUES (
    p_hotel_id,
    p_submitted_by,
    p_legal_name,
    p_rccm_number,
    p_tax_number,
    p_document_storage_path,
    p_document_mime_type
  )
  RETURNING * INTO v_submission;

  UPDATE public.hotels
  SET business_verification_status = 'pending',
      business_verified_at = NULL,
      business_verified_by = NULL,
      business_verification_rejection_reason = NULL,
      updated_at = now()
  WHERE id = p_hotel_id;

  RETURN NEXT v_submission;
END;
$$;

CREATE OR REPLACE FUNCTION review_hotel_business_verification(
  p_submission_id UUID,
  p_reviewer_id UUID,
  p_decision TEXT,
  p_reason TEXT,
  p_notes TEXT
) RETURNS SETOF public.hotel_business_verification_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission public.hotel_business_verification_submissions%ROWTYPE;
  v_hotel_id UUID;
  v_status TEXT;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'INVALID_VERIFICATION_DECISION';
  END IF;

  SELECT hotel_id INTO v_hotel_id
  FROM public.hotel_business_verification_submissions
  WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_hotel_id::text, 0));
  SELECT * INTO v_submission
  FROM public.hotel_business_verification_submissions
  WHERE id = p_submission_id
  FOR UPDATE;
  IF NOT FOUND OR v_submission.status <> 'pending' THEN
    RETURN;
  END IF;

  v_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE public.hotel_business_verification_submissions
  SET status = v_status,
      reviewed_at = now(),
      reviewed_by = p_reviewer_id,
      review_notes = NULLIF(p_notes, ''),
      rejection_reason = CASE WHEN p_decision = 'reject' THEN p_reason ELSE NULL END,
      updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_submission;

  UPDATE public.hotels
  SET business_verification_status = v_status,
      business_verified_at = CASE WHEN p_decision = 'approve' THEN now() ELSE NULL END,
      business_verified_by = CASE WHEN p_decision = 'approve' THEN p_reviewer_id ELSE NULL END,
      business_verification_rejection_reason = CASE
        WHEN p_decision = 'reject' THEN p_reason ELSE NULL
      END,
      updated_at = now()
  WHERE id = v_hotel_id;

  RETURN NEXT v_submission;
END;
$$;

REVOKE ALL ON FUNCTION submit_hotel_business_verification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION review_hotel_business_verification(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_hotel_business_verification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION review_hotel_business_verification(UUID, UUID, TEXT, TEXT, TEXT)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.hotel_booking_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id UUID NOT NULL UNIQUE
    REFERENCES public.daily_booking_requests(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_for_guest INTEGER NOT NULL DEFAULT 0,
  unread_for_hotel INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hotel_booking_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.hotel_booking_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('guest', 'hotel')),
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_booking_messages_conversation
  ON public.hotel_booking_messages(conversation_id, created_at);

ALTER TABLE public.hotel_booking_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_booking_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Booking participants view hotel conversations"
  ON public.hotel_booking_conversations FOR SELECT
  USING (
    guest_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR current_user_hotel_role(hotel_id) IS NOT NULL
  );

CREATE POLICY "Booking participants view hotel messages"
  ON public.hotel_booking_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.hotel_booking_conversations
      WHERE guest_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
        OR current_user_hotel_role(hotel_id) IS NOT NULL
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'hotel_booking_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_booking_messages;
  END IF;
END $$;

COMMIT;
