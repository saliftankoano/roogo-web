-- 093: a real « Vendu » state on properties, automatic follower readings,
-- and the Instagram goal.
--
-- NOT EXECUTED. Written for review; run it only after Salif approves.
--
-- Depends on 091_team_goals_executed.sql and
-- 092_call_notes_and_demande_replies_executed.sql (both run 2026-10-16).
--
-- 1. properties.status gets the value 'vendu'. A sale listing is marked
--    sold by the Directeur or the Fondateur from the listing page, with the
--    date the deed was signed at the notary (sold_at), the sale price
--    (sold_price) and who marked it (sold_by). The goals metric
--    properties_sold now counts these rows, so team_goal_sales (empty, the
--    founder-confirmed sales of 091) is dropped. 'expired' no longer means
--    "rented or sold": it only means the listing is off.
-- 2. team_goal_readings.source: 'manuel' (typed in with a screenshot) or
--    'automatique' (read every night from the Meta Graph API by
--    /api/cron/social-followers).
-- 3. Seed: the goal « 500 abonnés Instagram » for 2026 and its first
--    reading (1 follower on 2026-10-16, account @roogo.burkina).
--
-- ALTER TYPE ... ADD VALUE stays outside the transaction: a new enum value
-- cannot be used in the transaction that adds it. Nothing below uses
-- 'vendu', so the order is safe either way; keeping it outside also lets the
-- file run on a Postgres that refuses ADD VALUE inside a block.

ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'vendu';

BEGIN;

-- 1. Sold state on properties.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sold_price NUMERIC CHECK (sold_price IS NULL OR sold_price >= 0),
  ADD COLUMN IF NOT EXISTS sold_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_sold_at
  ON public.properties (sold_at DESC)
  WHERE sold_at IS NOT NULL;

COMMENT ON COLUMN public.properties.sold_at IS
  'Date the sale deed was signed at the notary (status vendu). Cleared when the listing leaves vendu.';
COMMENT ON COLUMN public.properties.sold_price IS
  'Final sale price in FCFA (status vendu). Optional.';
COMMENT ON COLUMN public.properties.sold_by IS
  'Directeur or Fondateur who marked the listing sold.';

-- The founder-confirmed sales of 091 are replaced by the status (the table
-- was checked empty on 2026-10-16). Dropping the table drops its indexes,
-- grants and RLS settings with it.
DROP TABLE IF EXISTS public.team_goal_sales;

-- 2. Where a follower reading comes from.
ALTER TABLE public.team_goal_readings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manuel'
    CHECK (source IN ('manuel', 'automatique'));

COMMENT ON COLUMN public.team_goal_readings.source IS
  'manuel: typed in by the founder or the Directeur. automatique: read from the Meta Graph API by the nightly cron.';

-- One automatic reading per metric and day (the cron also checks first).
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_goal_readings_auto_day
  ON public.team_goal_readings (metric, measured_on)
  WHERE source = 'automatique';

-- 3. Seed: « 500 abonnés Instagram » for 2026, and the reading of that day.
-- created_by is the founder account when it exists. Safe to run twice.
WITH founder AS (
  SELECT id FROM public.users WHERE lower(email) = 'salift@roogobf.com' LIMIT 1
)
INSERT INTO public.team_goals (title, metric, target, period, start_date, end_date, sort_order, created_by)
SELECT '500 abonnés Instagram', 'instagram_followers', 500, 'year', DATE '2026-01-01', DATE '2026-12-31', 6,
       (SELECT id FROM founder)
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_goals g
  WHERE g.metric = 'instagram_followers' AND g.period = 'year' AND g.end_date = DATE '2026-12-31' AND g.archived_at IS NULL
);

WITH founder AS (
  SELECT id FROM public.users WHERE lower(email) = 'salift@roogobf.com' LIMIT 1
)
INSERT INTO public.team_goal_readings (metric, value, measured_on, entered_by, note, source)
SELECT 'instagram_followers', 1, DATE '2026-10-16', (SELECT id FROM founder), 'Premier relevé', 'manuel'
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_goal_readings r
  WHERE r.metric = 'instagram_followers' AND r.measured_on = DATE '2026-10-16'
);

COMMIT;
