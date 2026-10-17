-- 050: Roogo Sell economics v2 — base commission + surplus split.
--
-- The two-price-spread model (seller_net_price / list_price, migrations 039-043)
-- is replaced by a transparent commission: the listing keeps the SELLER'S desired
-- price D; Roogo takes a base percentage of D plus a share (default 50%) of any
-- surplus when the final sale price exceeds D. The seller is never shown Roogo's
-- public listing price; staff set and adjust it freely.
--
-- The percentages are platform settings on listing_config (founder-editable in
-- /admin/parametres, read live by web and mobile) and are SNAPSHOTTED onto each
-- mandate at send time so a settings change never rewrites a signed mandate.
--
-- sale_notary_price_basis records which amount the notary works from ('desired'
-- for now); it is stored/editable today and consumed by the future settlement flow.
--
-- Idempotent, kazedra-style.

-- 1) Platform settings (decimal fractions, matching commission_percentage = 0.07 style).
ALTER TABLE public.listing_config
  ADD COLUMN IF NOT EXISTS sale_base_commission_percentage NUMERIC NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS sale_surplus_split_percentage NUMERIC NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS sale_notary_price_basis TEXT NOT NULL DEFAULT 'desired';

ALTER TABLE public.listing_config
  DROP CONSTRAINT IF EXISTS listing_config_sale_notary_basis_check;
ALTER TABLE public.listing_config
  ADD CONSTRAINT listing_config_sale_notary_basis_check
  CHECK (sale_notary_price_basis IN ('desired', 'list'));

COMMENT ON COLUMN public.listing_config.sale_base_commission_percentage IS
  'Roogo commission on the seller''s desired price (decimal fraction, 0.10 = 10%).';
COMMENT ON COLUMN public.listing_config.sale_surplus_split_percentage IS
  'Roogo''s share of any amount realized above the desired price (0.50 = 50/50 split).';
COMMENT ON COLUMN public.listing_config.sale_notary_price_basis IS
  'Which amount the notary act is based on: ''desired'' (owner''s price) or ''list'' (Roogo''s price).';

-- 2) Mandates: v2 columns; the legacy two-price columns become nullable history.
ALTER TABLE public.property_mandates
  ADD COLUMN IF NOT EXISTS desired_price NUMERIC,
  ADD COLUMN IF NOT EXISTS base_commission_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS surplus_split_pct NUMERIC;

ALTER TABLE public.property_mandates
  ALTER COLUMN seller_net_price DROP NOT NULL,
  ALTER COLUMN list_price DROP NOT NULL;

COMMENT ON COLUMN public.property_mandates.desired_price IS
  'v2: the amount the owner wants to receive; the listing publishes at this price on signing.';
COMMENT ON COLUMN public.property_mandates.base_commission_pct IS
  'v2: snapshot of sale_base_commission_percentage at send time (decimal fraction).';
COMMENT ON COLUMN public.property_mandates.surplus_split_pct IS
  'v2: snapshot of sale_surplus_split_percentage at send time (decimal fraction).';
COMMENT ON COLUMN public.property_mandates.seller_net_price IS
  'Legacy spread model (pre-050). Null on v2 mandates.';
COMMENT ON COLUMN public.property_mandates.list_price IS
  'Legacy spread model (pre-050). Null on v2 mandates; Roogo''s live price is properties.price.';
