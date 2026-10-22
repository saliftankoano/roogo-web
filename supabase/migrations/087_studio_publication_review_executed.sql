-- Content Studio: planning a finished video from its project, AI description,
-- founder review (design approved 2026-10-13). Run after 085 (086 is reserved
-- by another branch). Not applied anywhere yet.
--
--   * hashtags: kept apart from the description. What goes out is exactly
--     caption + blank line + hashtags (lib/studio/publishing.ts postText).
--   * caption_model / caption_generated_at: which model wrote the first draft
--     and when (NULL for a hand-written or template description).
--   * caption_edited_by / caption_edited_at: last person who saved the text,
--     the founder included when Salif edits it in the preview.
--   * submitted_by / submitted_at: who sent it to Salif ("Proposée par ...").
--   * returned_by / returned_at / review_comment / review_tags: Salif sent the
--     post back ("Renvoyer") with a required comment and quick tags. A
--     returned post is back to 'a_faire' and no longer holds its slot.
--     Sending it again clears returned_at.

ALTER TABLE public.studio_publications
  ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS caption_model TEXT,
  ADD COLUMN IF NOT EXISTS caption_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS caption_edited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caption_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_comment TEXT,
  ADD COLUMN IF NOT EXISTS review_tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.studio_publications
  DROP CONSTRAINT IF EXISTS studio_publications_hashtags_check;
ALTER TABLE public.studio_publications
  ADD CONSTRAINT studio_publications_hashtags_check CHECK (cardinality(hashtags) <= 5);

ALTER TABLE public.studio_publications
  DROP CONSTRAINT IF EXISTS studio_publications_review_tags_check;
ALTER TABLE public.studio_publications
  ADD CONSTRAINT studio_publications_review_tags_check
  CHECK (review_tags <@ ARRAY['Son', 'Description', 'Date', 'Image']::TEXT[]);

-- A returned post always carries the founder's comment.
ALTER TABLE public.studio_publications
  DROP CONSTRAINT IF EXISTS studio_publications_return_check;
ALTER TABLE public.studio_publications
  ADD CONSTRAINT studio_publications_return_check
  CHECK (returned_at IS NULL OR (status = 'a_faire' AND coalesce(btrim(review_comment), '') <> ''));

-- The project page looks a video's publication up by its artifact.
CREATE INDEX IF NOT EXISTS idx_studio_publications_artifact
  ON public.studio_publications (artifact_id, created_at DESC);

-- The founder badge counts posts waiting for validation.
CREATE INDEX IF NOT EXISTS idx_studio_publications_waiting
  ON public.studio_publications (scheduled_at)
  WHERE status = 'a_valider';
