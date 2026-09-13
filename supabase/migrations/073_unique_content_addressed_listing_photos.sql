-- Apply before deploying the content-addressed single-photo upload route.
-- Legacy/UUID photo URLs are unaffected. A conflict can be an orphan or an
-- in-flight upload; both requests may attempt to link, but only one may win.
BEGIN;
CREATE UNIQUE INDEX property_images_content_addressed_url_unique
  ON public.property_images (property_id, url)
  WHERE url ~ '/sha256-[0-9a-f]{64}\.(jpg|png|heic)$';
COMMIT;
