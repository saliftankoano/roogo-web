-- 076: move the seller's asking price out of the public properties table.
--
-- properties.seller_asking_price held the net amount the owner typed in the sale
-- wizard. Every properties column is exposed to anon through
-- public_property_details, so under Roogo Sell v3 (guaranteed seller price,
-- migration 075) that column would publish the seller's guaranteed net and
-- reveal Roogo's margin. The public price is always properties.price, which Roogo
-- sets to the top rung of the price ladder (net + listing markup).
--
-- This migration:
--   1) creates sale_asking_prices (service role only) for the owner's number,
--   2) copies existing values into it,
--   3) clears properties.seller_asking_price and blocks new writes to it.
--
-- NOT EXECUTED. Run after 075 with the production Supabase login.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sale_asking_prices (
  property_id UUID PRIMARY KEY
    REFERENCES public.properties(id) ON DELETE CASCADE,
  seller_asking_price NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'listing_wizard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_asking_prices_positive CHECK (seller_asking_price > 0),
  CONSTRAINT sale_asking_prices_source_check
    CHECK (source IN ('listing_wizard', 'backfill_properties'))
);

DROP TRIGGER IF EXISTS update_sale_asking_prices_updated_at
  ON public.sale_asking_prices;
CREATE TRIGGER update_sale_asking_prices_updated_at
  BEFORE UPDATE ON public.sale_asking_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sale_asking_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_asking_prices FROM anon, authenticated;
GRANT ALL ON public.sale_asking_prices TO service_role;

COMMENT ON TABLE public.sale_asking_prices IS
  'The net price a seller typed when listing a property for sale. Private: never exposed to anon or authenticated clients. The public price is properties.price.';

INSERT INTO public.sale_asking_prices (property_id, seller_asking_price, source)
SELECT id, seller_asking_price, 'backfill_properties'
FROM public.properties
WHERE seller_asking_price IS NOT NULL AND seller_asking_price > 0
ON CONFLICT (property_id) DO NOTHING;

UPDATE public.properties
SET seller_asking_price = NULL
WHERE seller_asking_price IS NOT NULL;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_seller_asking_price_private;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_seller_asking_price_private
  CHECK (seller_asking_price IS NULL);

COMMENT ON COLUMN public.properties.seller_asking_price IS
  'Retired by migration 076: always NULL. The seller''s asking price lives in sale_asking_prices (service role only).';

COMMIT;
