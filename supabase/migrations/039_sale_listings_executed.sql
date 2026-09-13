BEGIN;

-- Roogo Sell (Phase 1, broker model). Activates the dormant `vendre` listing type:
--   * the two-price broker model on `properties`: `seller_asking_price` is the net
--     the owner wants to walk away with; the existing `price` column is Roogo's
--     public sale/list price (set from the signed mandate, see 042). Roogo keeps the
--     spread. There is NO commission.
--   * staff-verified ownership documents (PUH / titre foncier; cloned from the
--     identity-KYC pattern, migration 025) that gate a sale listing from going live.
-- Rentals are untouched. The `listing_type` column already exists and defaults to
-- 'louer'; this migration only adds the sale machinery around it.

-- 1) Sale columns on properties ----------------------------------------------
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS seller_asking_price NUMERIC,
  ADD COLUMN IF NOT EXISTS ownership_verification_status TEXT NOT NULL DEFAULT 'unsubmitted',
  ADD COLUMN IF NOT EXISTS ownership_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ownership_verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ownership_verification_rejection_reason TEXT;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_ownership_verification_status_check,
  ADD CONSTRAINT properties_ownership_verification_status_check
    CHECK (ownership_verification_status IN ('unsubmitted', 'pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.properties.seller_asking_price IS
  'For vendre listings: the net amount the owner wants to receive. Roogo sets a higher public price (properties.price) via the signed mandate and keeps the spread.';
COMMENT ON COLUMN public.properties.ownership_verification_status IS
  'Staff verification status of ownership documents (PUH, titre foncier). A vendre listing cannot go en_ligne until approved.';

-- 2) Private bucket for ownership documents (clone of identity-documents) ------
INSERT INTO storage.buckets (id, name, public)
VALUES ('ownership-documents', 'ownership-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 3) Ownership document submissions (clone of identity_verification_submissions)
-- Ownership docs vary (titre foncier, attestation, plan cadastral) and can be
-- multi-page, so documents are stored as a JSONB array of {label, storage_path}.
CREATE TABLE IF NOT EXISTS public.property_ownership_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT property_ownership_submissions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_property_ownership_submissions_property_id
  ON public.property_ownership_submissions(property_id);

CREATE INDEX IF NOT EXISTS idx_property_ownership_submissions_status
  ON public.property_ownership_submissions(status, submitted_at DESC);

ALTER TABLE public.property_ownership_submissions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_property_ownership_submissions_updated_at
  ON public.property_ownership_submissions;
CREATE TRIGGER update_property_ownership_submissions_updated_at
  BEFORE UPDATE ON public.property_ownership_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: the submitting seller reads their own submissions; staff/founder read all.
-- Writes happen through service-role API routes (no authenticated write policies).
DROP POLICY IF EXISTS property_ownership_submissions_select
  ON public.property_ownership_submissions;
CREATE POLICY property_ownership_submissions_select
  ON public.property_ownership_submissions FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND user_type IN ('staff', 'founder')
    )
  );

-- 4) Recreate property_details so detail/browse can render the verified badge ---
-- Mirrors migration 029's definition + the new ownership_verified flag. p.* already
-- carries the new ownership columns; we only add the computed boolean. No document
-- paths or rejection details are exposed through the public view.
DROP VIEW IF EXISTS public.property_details;

CREATE VIEW public.property_details AS
SELECT
    p.*,
    u.full_name as agent_name,
    u.avatar_url as agent_avatar,
    u.phone as agent_phone,
    u.email as agent_email,
    u.user_type as agent_type,
    u.company_name as agent_company_name,
    u.professional_link as agent_facebook_url,
    u.identity_verification_status as agent_identity_verification_status,
    (u.identity_verification_status = 'approved') as agent_identity_verified,
    (p.ownership_verification_status = 'approved') as ownership_verified,
    r.full_name as renter_name,
    r.phone as renter_phone,
    r.email as renter_email,
    r.avatar_url as renter_avatar,
    pl.locked_at as lock_timestamp,
    pl.status as lock_status,
    ARRAY_AGG(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL) as amenities,
    ARRAY_AGG(DISTINCT pi.url) FILTER (WHERE pi.url IS NOT NULL) as images,
    (
        SELECT COUNT(*)
        FROM public.favorites f
        WHERE f.property_id = p.id
    ) as favorites_count
FROM public.properties p
LEFT JOIN public.users u ON p.agent_id = u.id
LEFT JOIN public.property_locks pl ON p.id = pl.property_id AND pl.status = 'active'
LEFT JOIN public.users r ON pl.renter_id = r.id
LEFT JOIN public.property_amenities pa ON p.id = pa.property_id
LEFT JOIN public.amenities a ON pa.amenity_id = a.id
LEFT JOIN public.property_images pi ON p.id = pi.property_id
GROUP BY p.id, u.id, r.id, pl.id;

ALTER VIEW public.property_details SET (security_invoker = true);

COMMIT;
