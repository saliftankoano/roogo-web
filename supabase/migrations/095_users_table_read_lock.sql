-- ================================================================
-- 095 Users table read lock, phase 2 of 2 (security, 2026-10-17)
-- ================================================================
--
-- Run after 094, and only once the mobile update from branch
-- fix/users-table-exposure (OTA on runtime 1.18.0, plus a store build) is on
-- the installed apps. That update reads the caller's own users row with the
-- Clerk token (lib/supabaseAuth.ts) instead of the anon client.
--
-- After this migration:
--   - anon sees no users row at all. It keeps SELECT on a few card columns
--     only so that old app queries embedding users(...) in a properties
--     select get an empty owner instead of a hard error; with no anon
--     policy, those columns return zero rows.
--   - authenticated (Clerk JWT) reads exactly its own row
--     (clerk_id = auth.jwt() ->> 'sub'), every column, so the existing
--     policies that look up "my users row" or "am I staff" keep working.
--   - nobody but the service role writes users (094).
--   - every existing policy on users is dropped first, so a permissive
--     dashboard policy such as USING (true) cannot keep the table open.
--   - public listing cards keep their owner name, avatar, phone and badges
--     through public_property_details, which 094 made run with its
--     owner's rights. This migration stops if the view owner could not
--     bypass RLS on users, because cards would then lose their owner.
--
-- Old app versions that cannot get the update (runtime older than 1.18.0):
-- browsing, details and contact buttons keep working (they use the view);
-- the profile load, the phone/WhatsApp completeness check, adding a
-- favourite, "Mes propriétés" and the listing edit screen lose the user's
-- own row. Those versions need the store update.
--
-- ---------------------------------------------------------------
-- Read-only preflight (nothing changes):
--
--   -- 094 must be in place: expect security_invoker=false and the [094] comment
--   SELECT c.reloptions, obj_description(c.oid, 'pg_class')
--   FROM pg_class c WHERE c.oid = 'public.public_property_details'::regclass;
--
--   -- The policies this migration will drop
--   SELECT policyname, roles, cmd, qual
--   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';
--
--   -- The view owner must own users or have BYPASSRLS (expect true)
--   SELECT pg_get_userbyid(v.relowner) AS view_owner,
--          pg_get_userbyid(u.relowner) AS users_owner,
--          v.relowner = u.relowner OR r.rolbypassrls AS view_sees_users
--   FROM pg_class v, pg_class u, pg_roles r
--   WHERE v.oid = 'public.public_property_details'::regclass
--     AND u.oid = 'public.users'::regclass AND r.oid = v.relowner;
--
-- Read-only check after running, in the SQL editor:
--
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.users'::regclass;  -- true
--   SELECT policyname, roles, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'users';  -- only users_select_own
--
-- and from any machine with the anon key (expect "*/0" for users, a 401 for
-- staff_users, and live cards still carrying agent_name):
--   node scripts/check-users-exposure.mjs
-- ---------------------------------------------------------------

BEGIN;

-- Safety: the listing view must still see owner rows once RLS is on.
DO $$
DECLARE
  view_sees_users boolean;
BEGIN
  IF coalesce(obj_description('public.public_property_details'::regclass, 'pg_class'), '')
       NOT LIKE '%[094]%' THEN
    RAISE EXCEPTION '095: run 094_users_table_exposure.sql first';
  END IF;

  SELECT v.relowner = u.relowner OR r.rolbypassrls
    INTO view_sees_users
  FROM pg_class v, pg_class u, pg_roles r
  WHERE v.oid = 'public.public_property_details'::regclass
    AND u.oid = 'public.users'::regclass
    AND r.oid = v.relowner;

  IF NOT view_sees_users THEN
    RAISE EXCEPTION '095: public_property_details owner cannot bypass RLS on users; listing cards would lose their owner';
  END IF;
END;
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop every policy on users, whoever created it.
DO $$
DECLARE
  policy record;
BEGIN
  FOR policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.users', policy.policyname);
  END LOOP;
END;
$$;

-- Start from nothing for client roles, table and column level.
REVOKE ALL ON public.users FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  column_list text;
BEGIN
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
    INTO column_list
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped;

  EXECUTE format(
    'REVOKE ALL (%s) ON public.users FROM PUBLIC, anon, authenticated',
    column_list
  );
END;
$$;

-- Signed-in users: their own row, every column, read only.
GRANT SELECT ON public.users TO authenticated;
CREATE POLICY users_select_own
  ON public.users
  FOR SELECT
  TO authenticated
  USING (clerk_id = (SELECT auth.jwt() ->> 'sub'));

-- Anon: card columns only, and no policy, so zero rows. Never add an anon
-- policy here; public owner fields belong in public_property_details.
GRANT SELECT (
  id, full_name, avatar_url, phone, email, professional_link,
  user_type, identity_verification_status
) ON public.users TO anon;

GRANT ALL ON public.users TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
