BEGIN;

-- 075: Roogo Sell economics v3, guaranteed seller price.
--
-- Approved by the founder on 2026-09-27 (plan: docs/sale-guaranteed-price-plan.md).
-- The seller receives exactly the net price named in the mandate. Roogo lists
-- above it (listing +30%, target +20%, team floor +15%, founder approval down to
-- the +10% hard floor, below refused). From the margin, paid as a percentage of
-- the FINAL sale price: notary 2%, buyer referrer 2% (if any), seller referrer
-- 1% (if any); Roogo keeps the rest. Bypass: a sale within 12 months to a buyer
-- Roogo introduced owes Roogo 10% of the sale price.
--
-- Calculation lives in lib/sale-economics.ts (mirrored in the mobile app).
--
-- Where the settings live:
--   * sale_economics_config (NEW, service role only): the price ladder and fee
--     percentages. These are NOT added to listing_config because listing_config
--     is readable by anyone with the public anon key (policy "Anyone can read
--     listing config"); a public listing markup would let any buyer compute the
--     seller's net and Roogo's floors from the listing price.
--   * listing_config: only the two seller-facing bypass terms (they are printed
--     in the mandate the seller signs, so they are safe to be public).
--
-- v2 columns (migration 050) stay as history; new mandates stop reading them.
-- Existing mandates keep economics_version = 'v2'.
--
-- Written for manual execution by the founder. Idempotent.

-- 1) Private v3 settings (single row 'default', founder-editable via the API).
CREATE TABLE IF NOT EXISTS public.sale_economics_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  listing_markup_pct NUMERIC NOT NULL DEFAULT 0.30,
  target_markup_pct NUMERIC NOT NULL DEFAULT 0.20,
  team_floor_markup_pct NUMERIC NOT NULL DEFAULT 0.15,
  hard_floor_markup_pct NUMERIC NOT NULL DEFAULT 0.10,
  notary_fee_pct NUMERIC NOT NULL DEFAULT 0.02,
  buyer_referral_pct NUMERIC NOT NULL DEFAULT 0.02,
  seller_referral_pct NUMERIC NOT NULL DEFAULT 0.01,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_economics_config_singleton CHECK (id = 'default'),
  CONSTRAINT sale_economics_config_pct_range CHECK (
    listing_markup_pct BETWEEN 0 AND 1
    AND target_markup_pct BETWEEN 0 AND 1
    AND team_floor_markup_pct BETWEEN 0 AND 1
    AND hard_floor_markup_pct BETWEEN 0 AND 1
    AND notary_fee_pct BETWEEN 0 AND 1
    AND buyer_referral_pct BETWEEN 0 AND 1
    AND seller_referral_pct BETWEEN 0 AND 1
  ),
  CONSTRAINT sale_economics_config_ladder_order CHECK (
    hard_floor_markup_pct <= team_floor_markup_pct
    AND team_floor_markup_pct <= target_markup_pct
    AND target_markup_pct <= listing_markup_pct
  ),
  -- At the hard floor, the fees (all referrers present) must still fit in the
  -- margin, so no allowed sale can leave Roogo with a negative margin.
  CONSTRAINT sale_economics_config_fees_fit_hard_floor CHECK (
    (1 + hard_floor_markup_pct)
      * (notary_fee_pct + buyer_referral_pct + seller_referral_pct)
      <= hard_floor_markup_pct
  )
);

INSERT INTO public.sale_economics_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS update_sale_economics_config_updated_at
  ON public.sale_economics_config;
CREATE TRIGGER update_sale_economics_config_updated_at
  BEFORE UPDATE ON public.sale_economics_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sale_economics_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_economics_config FROM anon, authenticated;
GRANT ALL ON public.sale_economics_config TO service_role;

COMMENT ON TABLE public.sale_economics_config IS
  'Roogo Sell v3 price ladder and fee percentages (decimal fractions). Service role only: never expose publicly.';

-- 2) Seller-facing bypass terms on the public config.
ALTER TABLE public.listing_config
  ADD COLUMN IF NOT EXISTS sale_bypass_fee_pct NUMERIC NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS sale_bypass_months INTEGER NOT NULL DEFAULT 12;

ALTER TABLE public.listing_config
  DROP CONSTRAINT IF EXISTS listing_config_sale_bypass_check;
ALTER TABLE public.listing_config
  ADD CONSTRAINT listing_config_sale_bypass_check CHECK (
    sale_bypass_fee_pct BETWEEN 0 AND 1
    AND sale_bypass_months >= 1
  );

COMMENT ON COLUMN public.listing_config.sale_bypass_fee_pct IS
  'v3: fee owed to Roogo (fraction of the sale price) if the property is sold outside Roogo to a buyer Roogo introduced.';
COMMENT ON COLUMN public.listing_config.sale_bypass_months IS
  'v3: how long after signing the mandate the bypass clause applies.';

-- 3) Mandates: version marker + v3 snapshots.
ALTER TABLE public.property_mandates
  ADD COLUMN IF NOT EXISTS economics_version TEXT NOT NULL DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS listing_markup_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS target_markup_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS team_floor_markup_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS hard_floor_markup_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS notary_fee_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS buyer_referral_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS seller_referral_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS bypass_fee_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS bypass_months INTEGER;

ALTER TABLE public.property_mandates
  DROP CONSTRAINT IF EXISTS property_mandates_economics_version_check;
ALTER TABLE public.property_mandates
  ADD CONSTRAINT property_mandates_economics_version_check
  CHECK (economics_version IN ('v2', 'v3'));

ALTER TABLE public.property_mandates
  DROP CONSTRAINT IF EXISTS property_mandates_v3_snapshot_check;
ALTER TABLE public.property_mandates
  ADD CONSTRAINT property_mandates_v3_snapshot_check CHECK (
    economics_version <> 'v3'
    OR (
      seller_net_price IS NOT NULL
      AND seller_net_price > 0
      AND listing_markup_pct IS NOT NULL
      AND target_markup_pct IS NOT NULL
      AND team_floor_markup_pct IS NOT NULL
      AND hard_floor_markup_pct IS NOT NULL
      AND notary_fee_pct IS NOT NULL
      AND buyer_referral_pct IS NOT NULL
      AND seller_referral_pct IS NOT NULL
      AND bypass_fee_pct IS NOT NULL
      AND bypass_months IS NOT NULL
    )
  );

COMMENT ON COLUMN public.property_mandates.economics_version IS
  '''v2'' = desired price + commission (050); ''v3'' = guaranteed net price (075).';
COMMENT ON COLUMN public.property_mandates.seller_net_price IS
  'v3: the guaranteed net the owner receives (authoritative). Pre-050 legacy spread rows also used it; null on v2 rows.';
COMMENT ON COLUMN public.property_mandates.desired_price IS
  'v2 only: the amount the owner wants to receive. Null on v3 rows (use seller_net_price).';

-- Sellers may read their own mandate rows through RLS (042). The v3 ladder and
-- fee snapshots must not reach them: with the listing markup a seller could
-- compute Roogo's exact listing price and floors. Replace the table-wide SELECT
-- with a column list; staff read everything through the service role.
REVOKE SELECT ON public.property_mandates FROM anon, authenticated;
GRANT SELECT (
  id, property_id, seller_id, conversation_id, economics_version,
  seller_net_price, list_price, desired_price, base_commission_pct,
  surplus_split_pct, bypass_fee_pct, bypass_months, exclusivity_days,
  exclusivity_start_at, exclusivity_end_at, status, terms_version,
  signed_typed_name, sent_at, signed_at, declined_at, created_at, updated_at
) ON public.property_mandates TO authenticated;

-- 4) Sale closings: one live record per sold property.
CREATE TABLE IF NOT EXISTS public.sale_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  mandate_id UUID NOT NULL REFERENCES public.property_mandates(id) ON DELETE RESTRICT,
  buyer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  buyer_name TEXT,
  buyer_phone TEXT,
  final_price NUMERIC NOT NULL,
  seller_net_price NUMERIC NOT NULL,       -- copied from the mandate
  -- Percentages copied from the mandate snapshot so each row checks itself.
  team_floor_markup_pct NUMERIC NOT NULL,
  hard_floor_markup_pct NUMERIC NOT NULL,
  notary_fee_pct NUMERIC NOT NULL,
  buyer_referral_pct NUMERIC NOT NULL,
  seller_referral_pct NUMERIC NOT NULL,
  bypass_fee_pct NUMERIC NOT NULL,
  buyer_referred BOOLEAN NOT NULL DEFAULT FALSE,
  seller_referred BOOLEAN NOT NULL DEFAULT FALSE,
  -- Free text until sale referrals exist (next plan).
  buyer_referrer_label TEXT,
  seller_referrer_label TEXT,
  notary_fee NUMERIC NOT NULL DEFAULT 0,
  buyer_referral_fee NUMERIC NOT NULL DEFAULT 0,
  seller_referral_fee NUMERIC NOT NULL DEFAULT 0,
  bypass_fee NUMERIC,
  roogo_margin NUMERIC NOT NULL,
  is_bypass BOOLEAN NOT NULL DEFAULT FALSE,
  below_team_floor BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notary_signed_at TIMESTAMPTZ,
  roogo_paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_closings_status_check
    CHECK (status IN ('draft', 'approved', 'notarized', 'settled', 'cancelled')),
  CONSTRAINT sale_closings_amounts_check CHECK (
    final_price > 0
    AND seller_net_price > 0
    AND notary_fee >= 0
    AND buyer_referral_fee >= 0
    AND seller_referral_fee >= 0
  ),
  CONSTRAINT sale_closings_referral_flags_check CHECK (
    (buyer_referred OR buyer_referral_fee = 0)
    AND (seller_referred OR seller_referral_fee = 0)
  ),
  -- Hard floor: never below net * (1 + hard floor) unless it is a bypass sale.
  CONSTRAINT sale_closings_hard_floor_check CHECK (
    is_bypass
    OR final_price >= seller_net_price * (1 + hard_floor_markup_pct)
  ),
  -- Roogo sale: margin is what is left after net and fees.
  -- Bypass sale: Roogo is owed the bypass fee; no notary or referral split.
  CONSTRAINT sale_closings_margin_check CHECK (
    (
      NOT is_bypass
      AND bypass_fee IS NULL
      AND roogo_margin
        = final_price - seller_net_price - notary_fee - buyer_referral_fee - seller_referral_fee
    )
    OR (
      is_bypass
      AND bypass_fee IS NOT NULL
      AND roogo_margin = bypass_fee
      AND notary_fee = 0
      AND buyer_referral_fee = 0
      AND seller_referral_fee = 0
    )
  ),
  -- Between the hard floor and the team floor, only a founder-approved row may
  -- move past draft.
  CONSTRAINT sale_closings_founder_approval_check CHECK (
    NOT below_team_floor
    OR is_bypass
    OR status IN ('draft', 'cancelled')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT sale_closings_settled_paid_check CHECK (
    status <> 'settled' OR roogo_paid_at IS NOT NULL
  )
);

-- One live closing per property; a cancelled closing can be replaced.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sale_closings_live_property
  ON public.sale_closings(property_id)
  WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_sale_closings_status
  ON public.sale_closings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_closings_mandate
  ON public.sale_closings(mandate_id);

DROP TRIGGER IF EXISTS update_sale_closings_updated_at
  ON public.sale_closings;
CREATE TRIGGER update_sale_closings_updated_at
  BEFORE UPDATE ON public.sale_closings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sale_closings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_closings FROM anon, authenticated;
GRANT ALL ON public.sale_closings TO service_role;

COMMENT ON TABLE public.sale_closings IS
  'Roogo Sell v3 closing record: final price, buyer, fees and payouts. Written only by staff API routes (service role). Contains buyer PII.';

-- 5) Evidence for the bypass clause: did Roogo introduce this buyer to this property?
CREATE INDEX IF NOT EXISTS idx_visit_requests_buyer_property
  ON public.visit_requests(buyer_id, property_id);

COMMIT;
