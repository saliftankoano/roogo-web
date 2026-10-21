-- 098: daily Google indexing check of live listings.
--
-- NOT EXECUTED. Written for review; run it only after Salif approves.
-- Safe for every app version: one new table, nothing existing changes.
--
-- /api/cron/listing-index-check (vercel.json, daily) asks the Google Search
-- Console URL Inspection API about every live listing and keeps the latest
-- answer here, one row per listing. /admin/annonces/google and the listing
-- page in the admin read it so staff see a listing Google has not indexed
-- within days, not months (the 2026-10-18 "Discovered - currently not
-- indexed" report was found by chance).
--
-- RLS on, no policies: service role only (the cron and staff server code).

BEGIN;

CREATE TABLE IF NOT EXISTS public.listing_index_checks (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  -- Search Console verdict: PASS (indexed), NEUTRAL (excluded, e.g.
  -- "Discovered - currently not indexed"), FAIL (error), or
  -- VERDICT_UNSPECIFIED.
  verdict TEXT NOT NULL,
  -- Human-readable state, e.g. "Submitted and indexed",
  -- "Discovered - currently not indexed".
  coverage_state TEXT,
  last_crawl_time TIMESTAMPTZ,
  google_canonical TEXT,
  -- Pages Google says link here; empty means Google found it only through
  -- the sitemap.
  referring_urls TEXT[] NOT NULL DEFAULT '{}',
  -- First daily check that saw the listing live: close to its publish date,
  -- which properties does not record. Staff are alerted 7 days after it.
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- First check that came back PASS; NULL while never indexed.
  first_indexed_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Last call error (quota, auth), kept so a broken check is visible.
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_listing_index_checks_verdict
  ON public.listing_index_checks (verdict, checked_at DESC);

ALTER TABLE public.listing_index_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_index_checks FROM anon, authenticated;

COMMIT;
