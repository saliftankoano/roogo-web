CREATE TABLE IF NOT EXISTS public.property_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  url text NOT NULL,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS property_videos_one_video_per_property
  ON public.property_videos(property_id);

ALTER TABLE IF EXISTS public.property_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_property_videos" ON public.property_videos;
CREATE POLICY "public_read_property_videos"
  ON public.property_videos
  FOR SELECT
  USING (true);
