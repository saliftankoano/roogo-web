BEGIN;

-- Ownership evidence is uploaded directly to this private bucket by sellers
-- and staff. Keep the storage boundary aligned with the API allowlist.
UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
WHERE id = 'ownership-documents';

COMMIT;
