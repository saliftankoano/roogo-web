-- ================================================================
-- 094 Users table exposure, phase 1 of 2 (security, 2026-10-17)
-- ================================================================
--
-- Problem found 2026-10-16: with the public anon key (shipped in the website
-- bundle and the mobile app) anyone could read every row of public.users
-- (emails, phones, WhatsApp, signup IP and device, budgets, staff level),
-- the four staff rows of the staff_users view, and the renter name, phone
-- and email that public_property_details joins for locked properties.
-- PostgREST also answered an anon PATCH on users with HTTP 200, which means
-- anon holds the UPDATE privilege on the table (without it Postgres answers
-- 42501 before looking at any row). Whether row policies stop such a write
-- could not be read from the repository.
--
-- This phase is safe for every app version in the field: no client reads
-- anything it removes.
--   1. No client role (anon, authenticated, PUBLIC) can INSERT, UPDATE or
--      DELETE users. Every users write already goes through server routes
--      with the service role (Clerk webhook, user-sync, /api/* handlers).
--      Without this, a signed-in user could set their own user_type to
--      'founder' and pass every policy that trusts users.user_type.
--   2. staff_users (staff emails and phones) is service-role only.
--   3. public_property_details keeps every column name (old apps select *),
--      but renter_name, renter_phone, renter_email and renter_avatar are
--      always NULL, and the view now runs with its owner's rights
--      (security_invoker = false). The view is the public contract for
--      listing cards: it decides which owner fields are public, so phase 2
--      can close the users table without blanking agent names and phones.
--
-- Phase 2 (095_users_table_read_lock.sql) closes reads on users. Run it only
-- after the mobile update that reads the caller's own row with the Clerk
-- token has reached the installed apps.
--
-- ---------------------------------------------------------------
-- Read-only preflight (run in the SQL editor first; nothing changes):
--
--   -- RLS state and owners
--   SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
--          pg_get_userbyid(c.relowner) AS owner, c.reloptions
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN ('users', 'staff_users', 'public_property_details');
--
--   -- Existing policies on users (phase 2 drops all of them)
--   SELECT policyname, roles, cmd, permissive, qual, with_check
--   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';
--
--   -- Table privileges held by client roles
--   SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type)
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND table_name IN ('users', 'staff_users', 'public_property_details')
--     AND grantee IN ('anon', 'authenticated', 'PUBLIC')
--   GROUP BY 1, 2 ORDER BY 1, 2;
--
--   -- Column-level write grants (a table REVOKE does not remove these)
--   SELECT grantee, privilege_type, count(*) AS columns
--   FROM information_schema.column_privileges
--   WHERE table_schema = 'public' AND table_name = 'users'
--     AND grantee IN ('anon', 'authenticated', 'PUBLIC')
--   GROUP BY 1, 2 ORDER BY 1, 2;
--
--   -- How many locked properties currently leak a renter through the view
--   SELECT count(*) FROM public.property_locks WHERE status = 'active';
--
-- Read-only check after running (expect false everywhere, and 0 renters):
--
--   SELECT r AS role,
--          has_table_privilege(r, 'public.users', 'INSERT') AS can_insert,
--          has_any_column_privilege(r, 'public.users', 'UPDATE') AS can_update,
--          has_table_privilege(r, 'public.users', 'DELETE') AS can_delete,
--          has_table_privilege(r, 'public.staff_users', 'SELECT') AS can_read_staff
--   FROM unnest(ARRAY['anon', 'authenticated']) AS r;
--
--   SELECT count(*) FILTER (WHERE renter_phone IS NOT NULL
--                              OR renter_email IS NOT NULL) AS renters_exposed,
--          count(*) FILTER (WHERE agent_name IS NOT NULL) AS cards_with_agent
--   FROM public.public_property_details;
-- ---------------------------------------------------------------

BEGIN;

-- 1. No client role writes users ---------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.users FROM PUBLIC, anon, authenticated;

-- Column-level INSERT/UPDATE/REFERENCES grants survive a table-level
-- REVOKE, so remove them column by column.
DO $$
DECLARE
  column_list text;
BEGIN
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
    INTO column_list
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped;

  EXECUTE format(
    'REVOKE INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON public.users FROM PUBLIC, anon, authenticated',
    column_list
  );
END;
$$;

GRANT ALL ON public.users TO service_role;

-- 2. staff_users is service-role only ----------------------------
DO $$
BEGIN
  IF to_regclass('public.staff_users') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.staff_users FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.staff_users TO service_role';
  END IF;
END;
$$;

-- 3. public_property_details: no renter fields, owner's rights ---
-- Same wrapping technique as 076 and 088: keep the live definition and every
-- column (name, order and type), replace only the renter projections.
-- The COMMENT marks the rebuild so a second run does not wrap it again.
DO $$
DECLARE
  definition text;
  options text;
  projection text;
BEGIN
  IF coalesce(obj_description('public.public_property_details'::regclass, 'pg_class'), '')
       LIKE '%[094]%' THEN
    RAISE NOTICE '094: public_property_details already rebuilt, skipping';
  ELSE
    definition := rtrim(
      pg_get_viewdef('public.public_property_details'::regclass, true), E';\n ');

    SELECT CASE WHEN reloptions IS NULL THEN ''
      ELSE ' WITH (' || array_to_string(reloptions, ', ') || ')' END
      INTO options
    FROM pg_class WHERE oid = 'public.public_property_details'::regclass;

    SELECT string_agg(
      CASE
        WHEN attname IN ('renter_name', 'renter_phone', 'renter_email', 'renter_avatar')
          THEN format('NULL::%s AS %I', format_type(atttypid, atttypmod), attname)
        ELSE format('details.%I', attname)
      END,
      ', ' ORDER BY attnum)
      INTO projection
    FROM pg_attribute
    WHERE attrelid = 'public.public_property_details'::regclass
      AND attnum > 0 AND NOT attisdropped;

    EXECUTE format(
      'CREATE OR REPLACE VIEW public.public_property_details%s AS SELECT %s FROM (%s) details',
      options, projection, definition
    );

    COMMENT ON VIEW public.public_property_details IS
      '[094] Public listing cards. Runs with the owner''s rights (security_invoker = false) '
      'so it can read the owner card from the private users table; renter fields are '
      'always NULL. Every column here is readable by anyone with the anon key.';
  END IF;
END;
$$;

ALTER VIEW public.public_property_details SET (security_invoker = false);

REVOKE ALL ON public.public_property_details FROM PUBLIC;
GRANT SELECT ON public.public_property_details TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
