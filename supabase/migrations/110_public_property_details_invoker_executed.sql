-- ================================================================
-- 110 Listing view runs with the reader's rights (security, 2026-11-08)
-- ================================================================
--
-- Supabase advisor: "Security Definer View: public.public_property_details".
--
-- 094 made public_property_details run with its owner's rights
-- (security_invoker = false) so listing cards could keep the owner's name and
-- phone once 095 closes the users table. The side effect: anyone with the anon
-- key reads the view with the owner's rights, so RLS on every table under it
-- (properties, property_images, property_locks, users, favorites) is skipped.
--
-- This migration takes users and favorites out of the view, then lets the
-- view obey the reader's RLS again:
--   1. public.agent_cards: the public owner card (name, avatar, phone, email,
--      type, company, link, ID check), one row per user, kept in sync by a
--      trigger on users. Anon and authenticated read a card only while its
--      owner has a rental listing that is en_ligne, locked or finalized.
--      Sale sellers never get a public card (broker model).
--   2. private.property_favorites_count(uuid): the heart count without
--      reading other people's favorites rows. In a schema the API does not
--      expose, so it is not callable as an RPC.
--   3. Read policies, added next to whatever exists (nothing is dropped):
--      properties: en_ligne, locked, finalized, vendu;
--      property_images: when its listing is visible to the reader;
--      property_locks: active locks of visible listings, anon only, and anon
--      keeps only the id, property_id, status and locked_at columns (no
--      renter_id). A policy is inert on a table whose RLS is off.
--   4. The view keeps every column (name, order, type): old apps select *.
--      Its live definition is kept; only the owner join, the renter join and
--      the favorites subquery are swapped. Then security_invoker = true.
--   5. Safety checks inside the transaction, as anon, before and after:
--      the number of live listings, of live rental cards with an owner name,
--      and of live listings with a photo must not change. Otherwise the
--      migration stops and nothing is applied.
--
-- Safe for every app version: no client reads renter fields (always NULL
-- since 094), lock_status or agent_email. Safe before or after 095.
-- Does not tighten what the anon key can read on properties itself: the
-- mobile app still reads its owner's pending listings with the anon key
-- (services/userService.ts). That is a separate change.
--
-- ---------------------------------------------------------------
-- Read-only preflight (SQL editor, nothing changes). Paste the result back.
--
--   -- RLS on the tables under the view
--   SELECT c.relname, c.relrowsecurity AS rls_on
--   FROM pg_class c
--   WHERE c.oid IN ('public.properties'::regclass, 'public.property_images'::regclass,
--     'public.property_locks'::regclass, 'public.users'::regclass,
--     'public.favorites'::regclass)
--   ORDER BY 1;
--
--   -- Existing read policies on them
--   SELECT tablename, policyname, roles, qual
--   FROM pg_policies
--   WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL')
--     AND tablename IN ('properties', 'property_images', 'property_locks')
--   ORDER BY 1, 2;
--
--   -- 094 must be in place (expect the [094] comment)
--   SELECT c.reloptions, obj_description(c.oid, 'pg_class')
--   FROM pg_class c WHERE c.oid = 'public.public_property_details'::regclass;
--
--   -- What the view shows today, by status
--   SELECT status, count(*) FROM public.public_property_details GROUP BY 1 ORDER BY 1;
--
-- Read-only check after running:
--
--   SELECT c.reloptions, obj_description(c.oid, 'pg_class')
--   FROM pg_class c WHERE c.oid = 'public.public_property_details'::regclass;
--   -- expect {security_invoker=true} and the [110] comment
--
--   SELECT count(*) FROM public.agent_cards;  -- one per user
--
-- then Advisors > Security: the "Security Definer View" error is gone.
-- From any machine with the anon key, live cards still carry agent_name:
--   node scripts/check-users-exposure.mjs
-- ---------------------------------------------------------------

BEGIN;

DO $$
BEGIN
  IF coalesce(obj_description('public.public_property_details'::regclass, 'pg_class'), '')
       NOT LIKE '%[094]%'
     AND coalesce(obj_description('public.public_property_details'::regclass, 'pg_class'), '')
       NOT LIKE '%[110]%' THEN
    RAISE EXCEPTION '110: run 094_users_table_exposure first';
  END IF;
END;
$$;

-- 1. A schema the API does not expose, for helpers the view calls ---------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- 2. agent_cards: the public owner card -----------------------------------
-- Same column types as users, so the view's agent_* columns keep their type.
DO $$
DECLARE
  card_columns text[] := ARRAY[
    'full_name', 'avatar_url', 'phone', 'email', 'user_type',
    'company_name', 'professional_link', 'identity_verification_status'
  ];
  definitions text;
  found integer;
BEGIN
  IF to_regclass('public.agent_cards') IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT count(*),
         string_agg(format('%I %s', attname, format_type(atttypid, atttypmod)), ', '
           ORDER BY array_position(card_columns, attname::text))
    INTO found, definitions
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = ANY (card_columns)
    AND attnum > 0 AND NOT attisdropped;

  IF found <> array_length(card_columns, 1) THEN
    RAISE EXCEPTION '110: users is missing a card column (found % of %)',
      found, array_length(card_columns, 1);
  END IF;

  EXECUTE format(
    'CREATE TABLE public.agent_cards ('
    || 'id %s PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE, '
    || '%s, updated_at timestamptz NOT NULL DEFAULT now())',
    (SELECT format_type(atttypid, atttypmod) FROM pg_attribute
      WHERE attrelid = 'public.users'::regclass AND attname = 'id'),
    definitions
  );
END;
$$;

COMMENT ON TABLE public.agent_cards IS
  '[110] Public owner card for listing cards, copied from users by the '
  'users_sync_agent_card trigger. Readable only while the owner has a rental '
  'listing that is en_ligne, locked or finalized. Never write it directly.';

CREATE OR REPLACE FUNCTION private.sync_agent_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.agent_cards AS card (
    id, full_name, avatar_url, phone, email, user_type,
    company_name, professional_link, identity_verification_status, updated_at
  ) VALUES (
    NEW.id, NEW.full_name, NEW.avatar_url, NEW.phone, NEW.email, NEW.user_type,
    NEW.company_name, NEW.professional_link, NEW.identity_verification_status, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    user_type = EXCLUDED.user_type,
    company_name = EXCLUDED.company_name,
    professional_link = EXCLUDED.professional_link,
    identity_verification_status = EXCLUDED.identity_verification_status,
    updated_at = now();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_agent_card() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_sync_agent_card ON public.users;
CREATE TRIGGER users_sync_agent_card
  AFTER INSERT OR UPDATE OF
    full_name, avatar_url, phone, email, user_type,
    company_name, professional_link, identity_verification_status
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_agent_card();

INSERT INTO public.agent_cards (
  id, full_name, avatar_url, phone, email, user_type,
  company_name, professional_link, identity_verification_status, updated_at
)
SELECT id, full_name, avatar_url, phone, email, user_type,
       company_name, professional_link, identity_verification_status, now()
FROM public.users
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  avatar_url = EXCLUDED.avatar_url,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  user_type = EXCLUDED.user_type,
  company_name = EXCLUDED.company_name,
  professional_link = EXCLUDED.professional_link,
  identity_verification_status = EXCLUDED.identity_verification_status,
  updated_at = now();

ALTER TABLE public.agent_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_cards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_cards TO anon, authenticated;
GRANT ALL ON public.agent_cards TO service_role;

DROP POLICY IF EXISTS agent_cards_public_read ON public.agent_cards;
CREATE POLICY agent_cards_public_read
  ON public.agent_cards
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.agent_id = agent_cards.id
        AND p.listing_type IS DISTINCT FROM 'vendre'
        AND p.status IN ('en_ligne', 'locked', 'finalized')
    )
  );

-- 3. Heart count without reading other people's favorites -----------------
CREATE OR REPLACE FUNCTION private.property_favorites_count(p_property_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM public.favorites WHERE property_id = p_property_id
$$;

REVOKE ALL ON FUNCTION private.property_favorites_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.property_favorites_count(uuid)
  TO anon, authenticated, service_role;

-- 4. Read policies under the view (added, nothing dropped) ----------------
DROP POLICY IF EXISTS properties_public_read ON public.properties;
CREATE POLICY properties_public_read
  ON public.properties
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('en_ligne', 'locked', 'finalized', 'vendu'));

DROP POLICY IF EXISTS property_images_public_read ON public.property_images;
CREATE POLICY property_images_public_read
  ON public.property_images
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_images.property_id)
  );

DROP POLICY IF EXISTS property_locks_public_read ON public.property_locks;
CREATE POLICY property_locks_public_read
  ON public.property_locks
  FOR SELECT
  TO anon
  USING (
    status = 'active'
    AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_locks.property_id)
  );

-- Anon never needs who rented: the view only reads these four columns.
REVOKE SELECT ON public.property_locks FROM anon;
GRANT SELECT (id, property_id, status, locked_at) ON public.property_locks TO anon;

-- 5. The view: same columns, no users, no favorites, reader's rights ------
DO $$
DECLARE
  definition text;
  rebuilt text;
  options text;
  dependency text;
  live_before bigint; named_before bigint; photo_before bigint;
  live_after bigint; named_after bigint; photo_after bigint;
BEGIN
  IF coalesce(obj_description('public.public_property_details'::regclass, 'pg_class'), '')
       LIKE '%[110]%' THEN
    RAISE NOTICE '110: public_property_details already rebuilt, skipping';
    RETURN;
  END IF;

  -- What anon sees now (owner's rights).
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*),
         count(*) FILTER (WHERE listing_type IS DISTINCT FROM 'vendre' AND agent_name IS NOT NULL),
         count(*) FILTER (WHERE primary_image IS NOT NULL)
    INTO live_before, named_before, photo_before
  FROM public.public_property_details
  WHERE status = 'en_ligne' AND is_test IS NOT TRUE;
  EXECUTE 'RESET ROLE';

  definition := rtrim(
    pg_get_viewdef('public.public_property_details'::regclass, true), E';\n ');

  rebuilt := regexp_replace(definition,
    'JOIN\s+(public\.)?users\s+u\s+ON\s+p\.agent_id\s*=\s*u\.id',
    'JOIN public.agent_cards u ON p.agent_id = u.id', 'g');
  rebuilt := regexp_replace(rebuilt,
    'JOIN\s+(public\.)?users\s+r\s+ON\s+pl\.renter_id\s*=\s*r\.id',
    'JOIN public.agent_cards r ON false', 'g');
  rebuilt := regexp_replace(rebuilt,
    '\(\s*SELECT\s+count\(\*\)\s+AS\s+count\s+FROM\s+(public\.)?favorites\s+f\s+WHERE\s+f\.property_id\s*=\s*p\.id\s*\)',
    'private.property_favorites_count(p.id)', 'g');

  SELECT CASE WHEN reloptions IS NULL THEN ''
    ELSE ' WITH (' || array_to_string(reloptions, ', ') || ')' END
    INTO options
  FROM pg_class WHERE oid = 'public.public_property_details'::regclass;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.public_property_details%s AS %s',
    options, rebuilt
  );
  ALTER VIEW public.public_property_details SET (security_invoker = true);

  -- The view must no longer read users or favorites.
  SELECT string_agg(DISTINCT d.refobjid::regclass::text, ', ')
    INTO dependency
  FROM pg_depend d
  JOIN pg_rewrite rw ON rw.oid = d.objid
  WHERE rw.ev_class = 'public.public_property_details'::regclass
    AND d.refobjid IN ('public.users'::regclass, 'public.favorites'::regclass);

  IF dependency IS NOT NULL THEN
    RAISE EXCEPTION '110: the view still reads % (live definition not as expected)', dependency;
  END IF;

  -- What anon sees now (reader's rights). Nothing live may disappear.
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*),
         count(*) FILTER (WHERE listing_type IS DISTINCT FROM 'vendre' AND agent_name IS NOT NULL),
         count(*) FILTER (WHERE primary_image IS NOT NULL)
    INTO live_after, named_after, photo_after
  FROM public.public_property_details
  WHERE status = 'en_ligne' AND is_test IS NOT TRUE;
  EXECUTE 'RESET ROLE';

  IF (live_after, named_after, photo_after) IS DISTINCT FROM (live_before, named_before, photo_before) THEN
    RAISE EXCEPTION '110: anon would lose live cards (listings %->%, owner names %->%, photos %->%)',
      live_before, live_after, named_before, named_after, photo_before, photo_after;
  END IF;

  RAISE NOTICE '110: anon still sees % live listings, % owner names, % photos',
    live_after, named_after, photo_after;

  COMMENT ON VIEW public.public_property_details IS
    '[094] [110] Public listing cards. Runs with the reader''s rights '
    '(security_invoker = true). Owner fields come from agent_cards, renter '
    'fields are always NULL. Every column here is readable by anyone with the anon key.';
END;
$$;

REVOKE ALL ON public.public_property_details FROM PUBLIC;
GRANT SELECT ON public.public_property_details TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
