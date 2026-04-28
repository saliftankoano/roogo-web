-- ================================================================
-- RLS + security hardening for Supabase advisor findings
-- ================================================================

BEGIN;

-- 1. Enable RLS on advisor-flagged public tables -----------------
ALTER TABLE IF EXISTS public.open_house_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.property_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.property_storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.owner_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.owner_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.owner_payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deposit_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deposit_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deposit_claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deposit_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.listing_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.property_views ENABLE ROW LEVEL SECURITY;

-- 2. Public catalog/read-only policies ----------------------------
DROP POLICY IF EXISTS "public_read_amenities" ON public.amenities;
CREATE POLICY "public_read_amenities"
  ON public.amenities
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_read_property_amenities" ON public.property_amenities;
CREATE POLICY "public_read_property_amenities"
  ON public.property_amenities
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_read_active_listing_addons" ON public.listing_addons;
CREATE POLICY "public_read_active_listing_addons"
  ON public.listing_addons
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- The old policy name comes from migration 001.
DROP POLICY IF EXISTS "Users can view their own property view history" ON public.property_views;
DROP POLICY IF EXISTS "users_read_own_property_views" ON public.property_views;
CREATE POLICY "users_read_own_property_views"
  ON public.property_views
  FOR SELECT
  TO authenticated
  USING (clerk_id = auth.jwt() ->> 'sub');

-- No anon/authenticated policies are created for:
-- open_house_bookings, owner_* wallet tables, deposit_* tables, or the
-- storage cleanup queue. Those paths are intentionally mediated by
-- service-role API routes.

-- 3. Make views obey caller RLS instead of owner privileges --------
DO $$
BEGIN
  IF to_regclass('public.property_details') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.property_details SET (security_invoker = true)';
  END IF;

  IF to_regclass('public.owner_wallet_summary') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.owner_wallet_summary SET (security_invoker = true)';
  END IF;

  IF to_regclass('public.staff_users') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.staff_users SET (security_invoker = true)';
  END IF;
END $$;

-- 4. Pin search_path for public functions -------------------------
DO $$
DECLARE
  function_name text;
  function_names text[] := ARRAY[
    'record_property_view',
    'get_trending_properties',
    'aggregate_old_views',
    'increment_property_views',
    'is_staff',
    'handle_clerk_webhook',
    'update_updated_at_column',
    'set_property_published_at',
    'update_early_bird_config_timestamp',
    'update_property_slots_filled',
    'close_property_on_limit_reached',
    'expire_closed_properties',
    'queue_property_listing_storage_cleanup'
  ];
  function_identity text;
BEGIN
  FOREACH function_name IN ARRAY function_names LOOP
    FOR function_identity IN
      SELECT format(
        '%I.%I(%s)',
        n.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid)
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = function_name
    LOOP
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', function_identity);
    END LOOP;
  END LOOP;
END $$;

-- 5. Restrict privileged RPC/function execution -------------------
DO $$
DECLARE
  function_identity text;
BEGIN
  FOR function_identity IN
    SELECT format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'record_property_view',
        'get_trending_properties',
        'aggregate_old_views',
        'increment_property_views',
        'is_staff',
        'handle_clerk_webhook',
        'queue_property_listing_storage_cleanup'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_identity);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_identity);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', function_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_identity);
  END LOOP;
END $$;

COMMIT;
