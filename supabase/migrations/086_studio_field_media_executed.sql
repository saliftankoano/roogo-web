-- Content Studio: field media index (Salif, 2026-10-12).
-- Run after 083. Numbers 084 and 085 are reserved by other branches; this file
-- does not depend on them. Staff only; RLS stays on with no policies, every
-- access goes through the service-role client in /api/admin/studio/media.
--
-- The files themselves live in the shared Google Drive "Roogo"
-- (Vente|Location / "Quartier - Nom du propriétaire"). The browser uploads
-- each file straight to Drive through a resumable session opened by the
-- server; this table is the Studio's index of those files so other features
-- (video templates) can use the clips.
--
-- upload_session_url is the Drive session address, a bearer credential for
-- that one upload (Google keeps it about a week). It is cleared when the
-- upload is finalized or fails.

CREATE TABLE IF NOT EXISTS public.studio_field_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  duration_seconds NUMERIC(10, 2) CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  drive_file_id TEXT UNIQUE,
  drive_folder_id TEXT NOT NULL,
  drive_folder_path TEXT,
  upload_session_url TEXT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'failed')),
  error TEXT,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT studio_field_media_ready_has_file
    CHECK (status <> 'ready' OR drive_file_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS studio_field_media_property
  ON public.studio_field_media (property_id, created_at DESC);

-- Finds an unfinished upload of the same file to resume it.
CREATE INDEX IF NOT EXISTS studio_field_media_resume
  ON public.studio_field_media (property_id, uploaded_by, file_name, size_bytes)
  WHERE status = 'uploading';

DROP TRIGGER IF EXISTS update_studio_field_media_updated_at ON public.studio_field_media;
CREATE TRIGGER update_studio_field_media_updated_at
  BEFORE UPDATE ON public.studio_field_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_field_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_field_media FROM anon, authenticated;
GRANT ALL ON public.studio_field_media TO service_role;
