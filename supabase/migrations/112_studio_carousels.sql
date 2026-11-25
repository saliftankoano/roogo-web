-- ================================================================
-- 112 Studio carousels (2026-10-22)
-- ================================================================
--
-- NOT EXECUTED. Salif runs it after approving the PR (branch
-- feat/studio-carousels). Until it runs, importing a carousel answers
-- « migration 112 à lancer » and nothing else changes.
--
-- What it does: one new artifact kind, 'carousel'. A carousel is an
-- educational social post (7 to 10 slides at 1080x1350) built by the
-- social-carousels skill. Its source is the carrousel.json object, kept in
-- studio_artifacts.meta.spec: every slide's text, photo, framing and
-- darkening. The photos live in the content-studio bucket under
-- carousels/<artifact id>/photos/, each one swappable. The JPEG slides are
-- outputs under carousels/<artifact id>/slides/<version>/, rebuilt after any
-- change; output_path points at the cover of the current version.
--
-- No new table, no new bucket: content-studio already accepts image/jpeg,
-- image/png and image/webp (081, 082). Additive only: existing rows keep
-- their kinds.

ALTER TABLE public.studio_artifacts
  DROP CONSTRAINT IF EXISTS studio_artifacts_kind_check;
ALTER TABLE public.studio_artifacts
  ADD CONSTRAINT studio_artifacts_kind_check
  CHECK (kind IN ('script', 'voiceover', 'image', 'captions', 'video', 'carousel'));
