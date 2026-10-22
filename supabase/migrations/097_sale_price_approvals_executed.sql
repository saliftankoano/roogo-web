-- ================================================================
-- 097 Sale price approvals (Roogo Sell, 2026-10-17)
-- ================================================================
--
-- NOT EXECUTED. Run after 096, before deploying the code of branch
-- feat/sale-listing-ladder (roogo-web PR #74), with the production Supabase
-- login. Until it runs, any sale price below +10% is refused by the API
-- (the approval cannot be recorded), which is the safe direction.
--
-- Rule (Salif, 2026-10-17): a sale is published at owner price + 30%. From
-- +10% up the team decides. Below +10% only the founder or the Directeur
-- (staff_level 'director'), the Directeur confirming "J'en ai discuté avec
-- Salif". Below the owner's own price, founder or Directeur only, confirming
-- "Le propriétaire a accepté ce prix (accord verbal)". Rentals are never
-- concerned.
--
-- This migration:
--   1) creates sale_price_approvals: one row per public sale price set below
--      +10%, written by PATCH /api/properties/[id] in the same request.
--      Service role only: it holds the owner's private price.
--   2) relaxes sale_closings (075, v3, empty, unused by current code): the
--      hard stop at +10% is replaced by "below +10% needs an approval"
--      (approved_by and approved_at set) before a closing leaves draft.

BEGIN;

-- 1) Approvals ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sale_price_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approver_level TEXT NOT NULL,
  new_price NUMERIC NOT NULL,
  previous_price NUMERIC,
  -- The owner's price at the time (mandate desired_price or private asking
  -- price). Private: never copy it into logs or analytics.
  owner_price NUMERIC NOT NULL,
  -- new_price / owner_price - 1 (negative below the owner's price).
  markup_pct NUMERIC NOT NULL,
  below_owner_price BOOLEAN NOT NULL,
  discussed_with_salif BOOLEAN NOT NULL DEFAULT FALSE,
  owner_agreed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_price_approvals_level_check
    CHECK (approver_level IN ('founder', 'director')),
  CONSTRAINT sale_price_approvals_amounts_check
    CHECK (new_price > 0 AND owner_price > 0 AND (previous_price IS NULL OR previous_price > 0)),
  CONSTRAINT sale_price_approvals_below_owner_check
    CHECK (below_owner_price = (new_price < owner_price)),
  -- The Directeur must have discussed it with Salif.
  CONSTRAINT sale_price_approvals_director_check
    CHECK (approver_level <> 'director' OR discussed_with_salif),
  -- Below the owner's price, the owner's verbal agreement is required.
  CONSTRAINT sale_price_approvals_owner_check
    CHECK (NOT below_owner_price OR owner_agreed)
);

CREATE INDEX IF NOT EXISTS idx_sale_price_approvals_property
  ON public.sale_price_approvals(property_id, created_at DESC);

ALTER TABLE public.sale_price_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_price_approvals FROM anon, authenticated;
GRANT ALL ON public.sale_price_approvals TO service_role;

COMMENT ON TABLE public.sale_price_approvals IS
  'Roogo Sell: one row per public sale price set below owner price + 10%, by the founder or the Directeur, with the confirmations ticked. Written only by PATCH /api/properties/[id] (service role). Contains the owner''s private price.';

-- 2) sale_closings: no hard stop at +10% ------------------------------------

ALTER TABLE public.sale_closings
  DROP CONSTRAINT IF EXISTS sale_closings_hard_floor_check;

-- Below net * (1 + hard_floor_markup_pct), i.e. below +10%, a closing may be
-- drafted but cannot move on without an approval.
ALTER TABLE public.sale_closings
  DROP CONSTRAINT IF EXISTS sale_closings_below_floor_approval_check;
ALTER TABLE public.sale_closings
  ADD CONSTRAINT sale_closings_below_floor_approval_check CHECK (
    is_bypass
    OR final_price >= seller_net_price * (1 + hard_floor_markup_pct)
    OR status IN ('draft', 'cancelled')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  );

COMMIT;
