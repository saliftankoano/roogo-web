BEGIN;

CREATE TABLE IF NOT EXISTS public.property_listing_fees (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  owner_earning_id   UUID UNIQUE REFERENCES public.owner_earnings(id) ON DELETE SET NULL,
  fee_type           TEXT NOT NULL DEFAULT 'success_fee',
  rate_bps           INTEGER NOT NULL DEFAULT 5000 CHECK (rate_bps >= 0 AND rate_bps <= 10000),
  base_rent_amount   INTEGER NOT NULL CHECK (base_rent_amount >= 0),
  fee_amount         INTEGER NOT NULL CHECK (fee_amount >= 0),
  currency           TEXT NOT NULL DEFAULT 'XOF',
  status             TEXT NOT NULL DEFAULT 'pending',
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  collected_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT property_listing_fees_type_check
    CHECK (fee_type IN ('success_fee')),
  CONSTRAINT property_listing_fees_status_check
    CHECK (status IN ('pending', 'collected', 'waived', 'cancelled')),
  CONSTRAINT property_listing_fees_success_unique
    UNIQUE (property_id, fee_type)
);

CREATE INDEX IF NOT EXISTS idx_property_listing_fees_owner_id
  ON public.property_listing_fees(owner_id);

CREATE INDEX IF NOT EXISTS idx_property_listing_fees_status
  ON public.property_listing_fees(status);

CREATE INDEX IF NOT EXISTS idx_property_listing_fees_property_id
  ON public.property_listing_fees(property_id);

ALTER TABLE public.owner_earnings
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON TABLE public.property_listing_fees IS
  'Deferred listing success fees for monthly properties published with the free option.';

COMMENT ON COLUMN public.property_listing_fees.rate_bps IS
  'Success-fee rate in basis points. 5000 = 50% of one month of rent.';

COMMENT ON COLUMN public.owner_earnings.metadata IS
  'Structured metadata for special wallet credits, such as one-time listing success-fee collection.';

CREATE OR REPLACE TRIGGER property_listing_fees_updated_at
  BEFORE UPDATE ON public.property_listing_fees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.property_listing_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_can_read_property_listing_fees"
  ON public.property_listing_fees;
CREATE POLICY "owners_can_read_property_listing_fees"
  ON public.property_listing_fees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.clerk_id = auth.jwt() ->> 'sub'
        AND (
          u.id = property_listing_fees.owner_id
          OR u.user_type IN ('staff', 'founder')
        )
    )
  );

COMMIT;
