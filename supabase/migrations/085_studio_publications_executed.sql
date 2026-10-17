-- Content Studio: publishing calendar and automatic posting to Facebook and
-- Instagram. Run after 083 (084 and 086 are reserved by other branches).
-- Staff only. RLS enabled with no policies; every access goes through the
-- service role in /api/admin/studio/publications and the studio-publish cron.
--
--   * studio_publications: one planned post (one media, one caption, one or
--     more networks, one date). Status follows the team's approval rule:
--     a_faire -> a_valider (staff) -> valide (founder only) -> publie | echec.
--     Nothing reaches a network unless a founder set it to 'valide'.
--   * claimed_at: the cron claims a post with a single
--     UPDATE ... WHERE status = 'valide' AND claimed_at IS NULL RETURNING,
--     so two overlapping runs can never publish the same post twice. A claim
--     is never re-taken automatically: a run that died mid-publish leaves the
--     post to be marked 'echec' with a "check the network first" message.
--   * results: per network, { status, remote_id, permalink, container_id,
--     error, published_at }. A retry skips networks already published.
--
-- No account table: the Page id, Instagram user id and Page token live in
-- Vercel environment variables (META_PAGE_ID, META_IG_USER_ID,
-- META_PAGE_ACCESS_TOKEN). Roogo publishes to one Page and one Instagram
-- account, the token has to be a secret anyway, and keeping the ids next to
-- it means one place to rotate. See docs/DECISIONS.md.

CREATE TABLE IF NOT EXISTS public.studio_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  artifact_id UUID REFERENCES public.studio_artifacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  -- Cadence step when created by "Planifier une visite" (presentation,
  -- walkthrough, carousel, tour_3d_link, ambiance_3d), NULL for a hand-made
  -- post. tour_3d_link is a text post published as a Facebook comment on the
  -- same visit's carousel post.
  cadence_step TEXT CHECK (cadence_step IS NULL OR cadence_step IN
    ('presentation', 'walkthrough', 'carousel', 'tour_3d_link', 'ambiance_3d')),
  visit_date DATE,
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'image', 'carousel', 'text')),
  -- Listing photos chosen for an image or carousel post (public listing
  -- bucket URLs, checked against the property's gallery on write).
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  caption TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  networks TEXT[] NOT NULL DEFAULT '{facebook,instagram}'
    CHECK (networks <@ ARRAY['facebook', 'instagram', 'tiktok']::TEXT[]),
  scheduled_at TIMESTAMPTZ NOT NULL,
  assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'a_faire'
    CHECK (status IN ('a_faire', 'a_valider', 'valide', 'publie', 'echec')),
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A post cannot be approved without a founder and a time.
  CONSTRAINT studio_publications_approval_check CHECK (
    status NOT IN ('valide', 'publie') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_studio_publications_scheduled
  ON public.studio_publications (scheduled_at);

-- The cron's pick list: approved, due, not yet claimed.
CREATE INDEX IF NOT EXISTS idx_studio_publications_due
  ON public.studio_publications (scheduled_at)
  WHERE status = 'valide';

CREATE INDEX IF NOT EXISTS idx_studio_publications_property
  ON public.studio_publications (property_id, scheduled_at);

ALTER TABLE public.studio_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_publications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_publications TO service_role;
