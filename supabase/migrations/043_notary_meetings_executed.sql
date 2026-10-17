BEGIN;

-- Roogo Sell (broker model) — notary meeting at the Roogo office.
--
-- When a buyer is ready to acquire, Roogo staff schedule a notary meeting at the Roogo
-- office (its own notary). It is scheduled from the admin console or the mobile app by
-- staff, posted into the buyer↔Roogo thread as a card (sale_messages.message_type =
-- 'notary_meeting'), and pushed to the buyer immediately. It carries the office label
-- and a Google Maps link so the buyer can get directions. Signing + payment happen
-- offline at the meeting.

CREATE TABLE IF NOT EXISTS public.notary_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.sale_conversations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location_label TEXT,                    -- e.g. "Bureau Roogo — Karpala, Ouagadougou"
  maps_url TEXT,                          -- Google Maps directions link
  status TEXT NOT NULL DEFAULT 'scheduled',
  assigned_staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notary_name TEXT,
  notes TEXT,
  message_id UUID REFERENCES public.sale_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notary_meetings_status_check
    CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_notary_meetings_conversation
  ON public.notary_meetings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notary_meetings_status
  ON public.notary_meetings(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notary_meetings_schedule
  ON public.notary_meetings(scheduled_at);

ALTER TABLE public.notary_meetings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_notary_meetings_updated_at
  ON public.notary_meetings;
CREATE TRIGGER update_notary_meetings_updated_at
  BEFORE UPDATE ON public.notary_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: visible to the buyer and any staff/founder.
DROP POLICY IF EXISTS notary_meetings_select ON public.notary_meetings;
CREATE POLICY notary_meetings_select
  ON public.notary_meetings FOR SELECT
  TO authenticated
  USING (
    buyer_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

COMMIT;
