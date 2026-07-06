BEGIN;

-- Roogo Sell — reconcile an already-shipped MARKETPLACE schema to the BROKER schema.
--
-- Context: migrations 039–041 were first applied to production in their pre-pivot
-- (buyer↔seller marketplace) form, out-of-band. The repo's 039–043 were then revised
-- in place to the broker model, but because they use CREATE TABLE IF NOT EXISTS they
-- cannot upgrade the existing tables. This one-time migration brings production to the
-- broker schema. All sale tables are empty (verified), so it drops and rebuilds them
-- rather than doing fragile column-by-column ALTERs. Safe to run on a fresh DB too
-- (it simply drops the freshly-created empty tables and recreates them identically).
--
-- Rentals are untouched.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) Drop the view first: it SELECTs properties.* and would otherwise block the
--    commission-column drops below.
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.property_details;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) properties: switch commission model → two-price broker model.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS seller_asking_price NUMERIC,
  ADD COLUMN IF NOT EXISTS ownership_verification_status TEXT NOT NULL DEFAULT 'unsubmitted',
  ADD COLUMN IF NOT EXISTS ownership_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ownership_verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ownership_verification_rejection_reason TEXT,
  DROP COLUMN IF EXISTS sale_commission_agreed_at,
  DROP COLUMN IF EXISTS sale_commission_terms_version;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_ownership_verification_status_check,
  ADD CONSTRAINT properties_ownership_verification_status_check
    CHECK (ownership_verification_status IN ('unsubmitted', 'pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.properties.seller_asking_price IS
  'For vendre listings: the net amount the owner wants to receive. Roogo sets a higher public price (properties.price) via the signed mandate and keeps the spread.';
COMMENT ON COLUMN public.properties.ownership_verification_status IS
  'Staff verification status of ownership documents (PUH, titre foncier). A vendre listing cannot go en_ligne until approved.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Drop the old (empty) sale objects. FK-safe order; CASCADE covers stragglers.
--    Dropping the chat/visit tables also removes them from supabase_realtime.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.notary_meetings CASCADE;
DROP TABLE IF EXISTS public.property_mandates CASCADE;
DROP TABLE IF EXISTS public.visit_requests CASCADE;
DROP TABLE IF EXISTS public.sale_message_attachments CASCADE;
DROP TABLE IF EXISTS public.sale_messages CASCADE;
DROP TABLE IF EXISTS public.sale_chat_consents CASCADE;
DROP TABLE IF EXISTS public.sale_conversations CASCADE;
DROP TABLE IF EXISTS public.property_ownership_submissions CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Ownership document submissions (from 039).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ownership-documents', 'ownership-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.property_ownership_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT property_ownership_submissions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_property_ownership_submissions_property_id
  ON public.property_ownership_submissions(property_id);
CREATE INDEX idx_property_ownership_submissions_status
  ON public.property_ownership_submissions(status, submitted_at DESC);

ALTER TABLE public.property_ownership_submissions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_property_ownership_submissions_updated_at
  BEFORE UPDATE ON public.property_ownership_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY property_ownership_submissions_select
  ON public.property_ownership_submissions FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub' AND user_type IN ('staff', 'founder')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Sale chat — Roogo is the only counterparty (from 040).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sale-chat-attachments', 'sale-chat-attachments', false,
  10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.sale_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_for_user INTEGER NOT NULL DEFAULT 0,
  unread_for_staff INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_conversations_kind_check CHECK (kind IN ('seller', 'buyer')),
  CONSTRAINT sale_conversations_status_check CHECK (status IN ('open', 'resolved', 'closed')),
  CONSTRAINT sale_conversations_property_user_kind_unique UNIQUE (property_id, user_id, kind)
);

CREATE INDEX idx_sale_conversations_user
  ON public.sale_conversations(user_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_sale_conversations_property_kind
  ON public.sale_conversations(property_id, kind);
CREATE INDEX idx_sale_conversations_last_message_at
  ON public.sale_conversations(last_message_at DESC NULLS LAST);

CREATE TABLE public.sale_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.sale_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_messages_sender_type_check
    CHECK (sender_type IN ('user', 'staff', 'system')),
  CONSTRAINT sale_messages_message_type_check
    CHECK (message_type IN (
      'text', 'visit_request', 'visit_confirmation',
      'mandate_offer', 'mandate_signed', 'notary_meeting'
    ))
);

CREATE INDEX idx_sale_messages_conversation
  ON public.sale_messages(conversation_id, created_at);

CREATE TABLE public.sale_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.sale_messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sale_message_attachments_message
  ON public.sale_message_attachments(message_id);

CREATE TRIGGER update_sale_conversations_updated_at
  BEFORE UPDATE ON public.sale_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sale_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY sale_conversations_select
  ON public.sale_conversations FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub' AND user_type IN ('staff', 'founder')
    )
  );

CREATE POLICY sale_messages_select
  ON public.sale_messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.sale_conversations c
      WHERE c.user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub' AND user_type IN ('staff', 'founder')
    )
  );

CREATE POLICY sale_message_attachments_select
  ON public.sale_message_attachments FOR SELECT
  TO authenticated
  USING (
    message_id IN (
      SELECT m.id FROM public.sale_messages m
      JOIN public.sale_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub' AND user_type IN ('staff', 'founder')
    )
  );

-- Realtime (tables were removed from the publication when dropped above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sale_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sale_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_conversations;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Visit requests (from 041).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.visit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.sale_conversations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  proposed_slots JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  scheduled_at TIMESTAMPTZ,
  assigned_staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  request_message_id UUID REFERENCES public.sale_messages(id) ON DELETE SET NULL,
  confirmation_message_id UUID REFERENCES public.sale_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visit_requests_status_check CHECK (status IN ('requested', 'confirmed', 'cancelled'))
);

CREATE INDEX idx_visit_requests_conversation ON public.visit_requests(conversation_id);
CREATE INDEX idx_visit_requests_status ON public.visit_requests(status, created_at DESC);
CREATE INDEX idx_visit_requests_schedule ON public.visit_requests(scheduled_at);

ALTER TABLE public.visit_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_visit_requests_updated_at
  BEFORE UPDATE ON public.visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY visit_requests_select
  ON public.visit_requests FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.sale_conversations c
      WHERE c.user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub' AND user_type IN ('staff', 'founder')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Property mandates (from 042).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.property_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.sale_conversations(id) ON DELETE SET NULL,
  seller_net_price NUMERIC NOT NULL,
  list_price NUMERIC NOT NULL,
  exclusivity_days INTEGER NOT NULL DEFAULT 90,
  exclusivity_start_at TIMESTAMPTZ,
  exclusivity_end_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'sent',
  terms_version TEXT NOT NULL,
  signed_typed_name TEXT,
  signature_meta JSONB,
  sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  offer_message_id UUID REFERENCES public.sale_messages(id) ON DELETE SET NULL,
  signed_message_id UUID REFERENCES public.sale_messages(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT property_mandates_status_check
    CHECK (status IN ('draft', 'sent', 'signed', 'declined', 'cancelled', 'expired'))
);

CREATE INDEX idx_property_mandates_property ON public.property_mandates(property_id, created_at DESC);
CREATE INDEX idx_property_mandates_seller ON public.property_mandates(seller_id, status);
CREATE INDEX idx_property_mandates_status ON public.property_mandates(status, sent_at DESC);
CREATE UNIQUE INDEX uniq_property_mandates_active
  ON public.property_mandates(property_id) WHERE status IN ('sent', 'signed');

ALTER TABLE public.property_mandates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_property_mandates_updated_at
  BEFORE UPDATE ON public.property_mandates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY property_mandates_select
  ON public.property_mandates FOR SELECT
  TO authenticated
  USING (
    seller_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub' AND user_type IN ('staff', 'founder')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Notary meetings (from 043).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.notary_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.sale_conversations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location_label TEXT,
  maps_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  assigned_staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notary_name TEXT,
  notes TEXT,
  message_id UUID REFERENCES public.sale_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notary_meetings_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);

CREATE INDEX idx_notary_meetings_conversation ON public.notary_meetings(conversation_id);
CREATE INDEX idx_notary_meetings_status ON public.notary_meetings(status, scheduled_at);
CREATE INDEX idx_notary_meetings_schedule ON public.notary_meetings(scheduled_at);

ALTER TABLE public.notary_meetings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_notary_meetings_updated_at
  BEFORE UPDATE ON public.notary_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY notary_meetings_select
  ON public.notary_meetings FOR SELECT
  TO authenticated
  USING (
    buyer_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub' AND user_type IN ('staff', 'founder')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Rebuild property_details with the ownership_verified flag (from 039), now that
--    properties has seller_asking_price and no commission columns.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.property_details AS
SELECT
    p.*,
    u.full_name as agent_name,
    u.avatar_url as agent_avatar,
    u.phone as agent_phone,
    u.email as agent_email,
    u.user_type as agent_type,
    u.company_name as agent_company_name,
    u.professional_link as agent_facebook_url,
    u.identity_verification_status as agent_identity_verification_status,
    (u.identity_verification_status = 'approved') as agent_identity_verified,
    (p.ownership_verification_status = 'approved') as ownership_verified,
    r.full_name as renter_name,
    r.phone as renter_phone,
    r.email as renter_email,
    r.avatar_url as renter_avatar,
    pl.locked_at as lock_timestamp,
    pl.status as lock_status,
    ARRAY_AGG(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL) as amenities,
    ARRAY_AGG(DISTINCT pi.url) FILTER (WHERE pi.url IS NOT NULL) as images,
    (
        SELECT COUNT(*) FROM public.favorites f WHERE f.property_id = p.id
    ) as favorites_count
FROM public.properties p
LEFT JOIN public.users u ON p.agent_id = u.id
LEFT JOIN public.property_locks pl ON p.id = pl.property_id AND pl.status = 'active'
LEFT JOIN public.users r ON pl.renter_id = r.id
LEFT JOIN public.property_amenities pa ON p.id = pa.property_id
LEFT JOIN public.amenities a ON pa.amenity_id = a.id
LEFT JOIN public.property_images pi ON p.id = pi.property_id
GROUP BY p.id, u.id, r.id, pl.id;

ALTER VIEW public.property_details SET (security_invoker = true);

COMMIT;
