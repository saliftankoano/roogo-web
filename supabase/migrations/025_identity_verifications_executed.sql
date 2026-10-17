BEGIN;

-- Private storage bucket for owner/agent identity documents. Access is mediated
-- through service-role API routes that issue short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('identity-documents', 'identity-documents', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS identity_verification_status TEXT NOT NULL DEFAULT 'unsubmitted',
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS identity_verification_rejection_reason TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_identity_verification_status_check,
  ADD CONSTRAINT users_identity_verification_status_check
    CHECK (identity_verification_status IN ('unsubmitted', 'pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.users.identity_verification_status IS
  'Manual identity verification status for owner/agent public trust badges.';
COMMENT ON COLUMN public.users.identity_verified_at IS
  'Timestamp when staff approved the latest identity verification.';
COMMENT ON COLUMN public.users.identity_verified_by IS
  'Staff/founder user who approved the latest identity verification.';
COMMENT ON COLUMN public.users.identity_verification_rejection_reason IS
  'Latest staff rejection reason shown privately to the user.';

CREATE TABLE IF NOT EXISTS public.identity_verification_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  front_storage_path TEXT NOT NULL,
  back_storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  rejection_reason TEXT,
  provider TEXT,
  provider_reference TEXT,
  provider_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT identity_verification_submissions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_identity_verification_submissions_user_id
  ON public.identity_verification_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_identity_verification_submissions_status
  ON public.identity_verification_submissions(status, submitted_at DESC);

ALTER TABLE public.identity_verification_submissions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_identity_verification_submissions_updated_at
  ON public.identity_verification_submissions;
CREATE TRIGGER update_identity_verification_submissions_updated_at
  BEFORE UPDATE ON public.identity_verification_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Recreate the listing view with public-safe verification fields. No ID document
-- paths or rejection details are exposed through this view.
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
        FROM favorites f
        WHERE f.property_id = p.id
    ) as favorites_count
FROM properties p
LEFT JOIN users u ON p.agent_id = u.id
LEFT JOIN property_locks pl ON p.id = pl.property_id AND pl.status = 'active'
LEFT JOIN users r ON pl.renter_id = r.id
LEFT JOIN property_amenities pa ON p.id = pa.property_id
LEFT JOIN amenities a ON pa.amenity_id = a.id
LEFT JOIN property_images pi ON p.id = pi.property_id
GROUP BY p.id, u.id, r.id, pl.id;

ALTER VIEW public.property_details SET (security_invoker = true);

COMMIT;
