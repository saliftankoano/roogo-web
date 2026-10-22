-- ================================================================
-- 103 Drawn signatures on rental agreements (2026-10-22)
-- ================================================================
--
-- NOT EXECUTED. Salif runs it after approving the PR (branch
-- feat/signature-contrat-bail). Until it runs, POST
-- /api/rental-agreements/[id]/sign still records the signature date for
-- a body without `signature` (current app versions); a body WITH a drawn
-- signature answers 503 « migration 103 à lancer » instead of silently
-- dropping the drawing. The PDF keeps the text-only signature block.
--
-- Numbering: main ends at 101 (social_inbox); 102 is taken by the
-- unmerged studio carousels branch (102_studio_carousels.sql).
--
-- What it stores:
--   * rental_agreements.owner_signature_path / renter_signature_path: the
--     path of each party's drawn signature inside the private bucket
--     agreement-signatures, e.g. <agreement_id>/owner.png. One column per
--     party, NULL until that party signs with a drawing (older signatures
--     have a date only).
--   * agreement-signatures: PRIVATE bucket, PNG only, 200 KB per file. No
--     storage policy is created, so anon and authenticated clients can
--     neither read nor write: only the service role (sign route, PDF
--     route) touches it. Same model as referrer-verification (024) and
--     team-goal-proofs (091).
--
-- Safe to run twice. Safe for every app version (new nullable columns).
-- ================================================================

ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS owner_signature_path TEXT
    CHECK (owner_signature_path IS NULL OR char_length(owner_signature_path) <= 300),
  ADD COLUMN IF NOT EXISTS renter_signature_path TEXT
    CHECK (renter_signature_path IS NULL OR char_length(renter_signature_path) <= 300);

COMMENT ON COLUMN public.rental_agreements.owner_signature_path IS
  'Path of the owner''s drawn signature (PNG) in the private bucket agreement-signatures. NULL when signed without a drawing.';
COMMENT ON COLUMN public.rental_agreements.renter_signature_path IS
  'Path of the renter''s drawn signature (PNG) in the private bucket agreement-signatures. NULL when signed without a drawing.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('agreement-signatures', 'agreement-signatures', false, 204800, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
