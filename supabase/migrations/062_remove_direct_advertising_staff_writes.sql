BEGIN;

-- Staff mutations must go through audited service-role API routes. Keeping
-- direct RLS writes would let staff bypass mandatory reasons and audit history.
DROP POLICY IF EXISTS "Staff manage advertiser profiles"
  ON public.advertiser_profiles;

COMMIT;
