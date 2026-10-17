BEGIN;

-- Roogo Sell (broker model) — visit requests for sale listings.
--
-- Roogo runs all visits; the owner need not attend. Inside a buyer↔Roogo conversation,
-- the buyer proposes 3 day+time options; Roogo staff confirm one. Both the request and
-- the confirmation are also posted as structured card messages (sale_messages.message_type)
-- so the whole exchange stays visible in the thread. This table is the source of truth
-- for the request lifecycle and feeds the admin queue; it is deliberately separate from
-- open_house_slots (the rental concept).

CREATE TABLE IF NOT EXISTS public.visit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.sale_conversations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  proposed_slots JSONB NOT NULL,        -- [{ "date": "2026-07-01", "time": "10:00" }, x3]
  status TEXT NOT NULL DEFAULT 'requested',
  scheduled_at TIMESTAMPTZ,             -- the slot staff confirmed
  assigned_staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  request_message_id UUID REFERENCES public.sale_messages(id) ON DELETE SET NULL,
  confirmation_message_id UUID REFERENCES public.sale_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visit_requests_status_check
    CHECK (status IN ('requested', 'confirmed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_visit_requests_conversation
  ON public.visit_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_visit_requests_status
  ON public.visit_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_requests_schedule
  ON public.visit_requests(scheduled_at);

ALTER TABLE public.visit_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_visit_requests_updated_at
  ON public.visit_requests;
CREATE TRIGGER update_visit_requests_updated_at
  BEFORE UPDATE ON public.visit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: visible to the conversation's user (the buyer) and any staff/founder.
DROP POLICY IF EXISTS visit_requests_select ON public.visit_requests;
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
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

COMMIT;
