-- Studio « Publier une vidéo » (PRD 2 and 3, approved by Salif on 2026-10-23).
-- Run after 104. NOT applied anywhere yet: Salif runs it before the merge.
-- Staff only. RLS on with no policies; every access goes through the service
-- role in /api/admin/studio/final-videos, /api/admin/studio/publications and
-- the studio-publish cron.
--
--   * studio_final_videos: one finished vertical video uploaded by the team.
--     The bytes never touch Supabase Storage (the project refuses anything
--     over 50 MB, docs/DECISIONS.md 2026-10-12): the browser sends them
--     straight to the shared Google Drive, folder Videos › « Vidéos finales »,
--     through a resumable session the server opens as the service account
--     (same mechanism as studio_field_media, migration 086). That Drive file
--     is both the archive copy (PRD 2.4) and what the networks download,
--     through a short-lived signed stream link. No storage bucket changes.
--     The limits below repeat the browser and server checks: 9:16 vertical,
--     at most 3 minutes, at most 500 MB, MP4 or MOV.
--     upload_session_url is the Drive session address, a bearer credential for
--     that one upload (Google keeps it about a week); cleared at finalize.
--     published_folder_at: when the file was moved to « Publié » (PRD 2.4b).
--   * studio_publications.final_video_id: the post publishes this uploaded
--     video instead of a Studio artifact.
--   * network_copy: the text per network (PRD 3), keyed by network:
--     {"facebook": {"text": "...", "hashtags": ["#Roogo", ...]}, ...}.
--     caption / hashtags keep the base text. What goes out on a network is
--     network_copy[network].text + blank line + its hashtags (falls back to the
--     base when a network has no entry).
--   * same_text: « Même texte partout » was on when the post was sent.
--   * publish_on_approval: « Dès que Salif valide »: the founder's « Valider »
--     sets scheduled_at to that moment and the publisher starts right away.
--   * networks: 'youtube' is accepted by the column so PRD 1 (YouTube Shorts)
--     needs no new constraint; the app refuses it until YouTube is connected.

CREATE TABLE IF NOT EXISTS public.studio_final_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 160),
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  drive_name TEXT NOT NULL CHECK (char_length(drive_name) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('video/mp4', 'video/quicktime')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 524288000),
  duration_seconds NUMERIC(10, 2) CHECK (duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 180.5)),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  drive_file_id TEXT UNIQUE,
  drive_folder_id TEXT NOT NULL,
  upload_session_url TEXT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'failed')),
  error TEXT,
  published_folder_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT studio_final_videos_ready_has_file
    CHECK (status <> 'ready' OR drive_file_id IS NOT NULL),
  -- Vertical only (9:16). Width and height come from the browser, then Drive.
  CONSTRAINT studio_final_videos_vertical
    CHECK (width IS NULL OR height IS NULL OR width < height)
);

CREATE INDEX IF NOT EXISTS studio_final_videos_uploader
  ON public.studio_final_videos (uploaded_by, created_at DESC);

-- Finds an unfinished upload of the same file to resume it.
CREATE INDEX IF NOT EXISTS studio_final_videos_resume
  ON public.studio_final_videos (uploaded_by, file_name, size_bytes)
  WHERE status = 'uploading';

DROP TRIGGER IF EXISTS update_studio_final_videos_updated_at ON public.studio_final_videos;
CREATE TRIGGER update_studio_final_videos_updated_at
  BEFORE UPDATE ON public.studio_final_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_final_videos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_final_videos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_final_videos TO service_role;

ALTER TABLE public.studio_publications
  ADD COLUMN IF NOT EXISTS final_video_id UUID REFERENCES public.studio_final_videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS network_copy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS same_text BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS publish_on_approval BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.studio_publications
  DROP CONSTRAINT IF EXISTS studio_publications_network_copy_check;
ALTER TABLE public.studio_publications
  ADD CONSTRAINT studio_publications_network_copy_check CHECK (jsonb_typeof(network_copy) = 'object');

-- The inline CHECK from 085 is named studio_publications_networks_check by Postgres.
ALTER TABLE public.studio_publications
  DROP CONSTRAINT IF EXISTS studio_publications_networks_check;
ALTER TABLE public.studio_publications
  ADD CONSTRAINT studio_publications_networks_check
  CHECK (networks <@ ARRAY['facebook', 'instagram', 'tiktok', 'youtube']::TEXT[]);

-- « Mes vidéos » and the founder's task look posts up by their uploaded video.
CREATE INDEX IF NOT EXISTS idx_studio_publications_final_video
  ON public.studio_publications (final_video_id, created_at DESC)
  WHERE final_video_id IS NOT NULL;
