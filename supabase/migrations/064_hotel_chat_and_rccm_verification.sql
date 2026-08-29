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

ALTER TABLE public.hotel_business_verification_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hotel admins view business verification submissions"
  ON public.hotel_business_verification_submissions FOR SELECT
  USING (current_user_hotel_role(hotel_id) = 'admin');

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
