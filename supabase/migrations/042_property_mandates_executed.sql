BEGIN;

-- Roogo Sell (broker model) — the price + exclusivity mandate the owner signs in-app.
--
-- After Roogo reviews a property (ownership docs + photos) and negotiates with the
-- owner in the seller↔Roogo chat, a staff member SENDS a mandate: the agreed net price
-- the owner walks away with (seller_net_price), Roogo's public sale price (list_price),
-- and an exclusivity period (exclusivity_days) during which the owner lists only with
-- Roogo. The owner SIGNS it in-app (tap-to-sign + typed name). Only a signed mandate
-- (plus approved ownership docs) lets the listing go en_ligne; signing also stamps
-- properties.price = list_price.
--
-- The offer and the signature are mirrored into the seller thread as card messages
-- (sale_messages.message_type = 'mandate_offer' / 'mandate_signed').

CREATE TABLE IF NOT EXISTS public.property_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.sale_conversations(id) ON DELETE SET NULL,
  seller_net_price NUMERIC NOT NULL,     -- what the owner walks away with
  list_price NUMERIC NOT NULL,           -- Roogo's public sale price (spread = list - net)
  exclusivity_days INTEGER NOT NULL DEFAULT 90,
  exclusivity_start_at TIMESTAMPTZ,      -- set on sign
  exclusivity_end_at TIMESTAMPTZ,        -- set on sign (start + exclusivity_days)
  status TEXT NOT NULL DEFAULT 'sent',
  terms_version TEXT NOT NULL,
  signed_typed_name TEXT,                -- the name the owner typed to sign
  signature_meta JSONB,                  -- { platform, signed_from, ... } for the record
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

CREATE INDEX IF NOT EXISTS idx_property_mandates_property
  ON public.property_mandates(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_mandates_seller
  ON public.property_mandates(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_property_mandates_status
  ON public.property_mandates(status, sent_at DESC);

-- At most one live (sent/signed) mandate per property.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_property_mandates_active
  ON public.property_mandates(property_id)
  WHERE status IN ('sent', 'signed');

ALTER TABLE public.property_mandates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_property_mandates_updated_at
  ON public.property_mandates;
CREATE TRIGGER update_property_mandates_updated_at
  BEFORE UPDATE ON public.property_mandates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: the owner reads their own mandates; staff/founder read all. Writes go through
-- service-role API routes (no authenticated write policies).
DROP POLICY IF EXISTS property_mandates_select ON public.property_mandates;
CREATE POLICY property_mandates_select
  ON public.property_mandates FOR SELECT
  TO authenticated
  USING (
    seller_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

COMMIT;
