BEGIN;

-- Advertising is an optional capability attached to an existing Roogo user.
-- Proofs remain private and are only exposed through authenticated API routes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'advertiser-proofs',
  'advertiser-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.advertiser_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  business_name TEXT,
  category TEXT,
  city_service_area TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_whatsapp TEXT,
  contact_email TEXT,
  years_operating TEXT,
  primary_customer TEXT,
  campaign_objective TEXT,
  expected_action TEXT,
  acquisition_source TEXT,
  monthly_revenue_range TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT advertiser_profiles_status_check CHECK (
    status IN ('draft', 'pending', 'approved', 'changes_requested', 'rejected', 'suspended')
  ),
  CONSTRAINT advertiser_profiles_revenue_check CHECK (
    monthly_revenue_range IS NULL OR monthly_revenue_range IN (
      'under_500k', '500k_1m', '1m_5m', '5m_10m', 'over_10m', 'prefer_not_to_say'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_advertiser_profiles_status
  ON public.advertiser_profiles(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.advertiser_profile_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_profile_id UUID NOT NULL REFERENCES public.advertiser_profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  storage_path TEXT,
  external_url TEXT,
  original_file_name TEXT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT advertiser_profile_proofs_kind_check CHECK (
    kind IN ('registration_document', 'storefront_photo', 'social_profile', 'website', 'staff_visit')
  ),
  CONSTRAINT advertiser_profile_proofs_status_check CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT advertiser_profile_proofs_source_check CHECK (
    (storage_path IS NOT NULL AND external_url IS NULL)
    OR (storage_path IS NULL AND external_url IS NOT NULL)
    OR kind = 'staff_visit'
  )
);

CREATE INDEX IF NOT EXISTS idx_advertiser_profile_proofs_profile
  ON public.advertiser_profile_proofs(advertiser_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_packages (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  tier TEXT NOT NULL,
  name TEXT NOT NULL,
  price_xof INTEGER NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  rotation_weight INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ad_packages_platform_check CHECK (platform IN ('web', 'mobile', 'both')),
  CONSTRAINT ad_packages_tier_check CHECK (tier IN ('standard', 'premium')),
  CONSTRAINT ad_packages_price_check CHECK (price_xof >= 0),
  CONSTRAINT ad_packages_duration_check CHECK (duration_days BETWEEN 1 AND 365),
  CONSTRAINT ad_packages_weight_check CHECK (rotation_weight BETWEEN 1 AND 100),
  UNIQUE (platform, tier)
);

INSERT INTO public.ad_packages
  (id, platform, tier, name, price_xof, duration_days, rotation_weight)
VALUES
  ('web_standard', 'web', 'standard', 'Web Standard', 10000, 30, 1),
  ('web_premium', 'web', 'premium', 'Web Premium', 20000, 30, 2),
  ('mobile_standard', 'mobile', 'standard', 'Mobile Standard', 15000, 30, 1),
  ('mobile_premium', 'mobile', 'premium', 'Mobile Premium', 30000, 30, 2),
  ('both_standard', 'both', 'standard', 'Web + mobile Standard', 25000, 30, 1),
  ('both_premium', 'both', 'premium', 'Web + mobile Premium', 50000, 30, 2)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.advertiser_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertiser_profile_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advertisers read own profile"
  ON public.advertiser_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = advertiser_profiles.user_id
        AND u.clerk_id = auth.jwt() ->> 'sub'
    )
    OR EXISTS (
      SELECT 1 FROM public.users staff
      WHERE staff.clerk_id = auth.jwt() ->> 'sub'
        AND staff.user_type IN ('staff', 'founder')
    )
  );

CREATE POLICY "Advertisers read own proofs"
  ON public.advertiser_profile_proofs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.advertiser_profiles ap
      JOIN public.users u ON u.id = ap.user_id
      WHERE ap.id = advertiser_profile_proofs.advertiser_profile_id
        AND u.clerk_id = auth.jwt() ->> 'sub'
    )
    OR EXISTS (
      SELECT 1 FROM public.users staff
      WHERE staff.clerk_id = auth.jwt() ->> 'sub'
        AND staff.user_type IN ('staff', 'founder')
    )
  );

CREATE POLICY "Anyone reads active ad packages"
  ON public.ad_packages FOR SELECT TO public
  USING (active = TRUE);

DROP TRIGGER IF EXISTS update_advertiser_profiles_updated_at ON public.advertiser_profiles;
CREATE TRIGGER update_advertiser_profiles_updated_at
  BEFORE UPDATE ON public.advertiser_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ad_packages_updated_at ON public.ad_packages;
CREATE TRIGGER update_ad_packages_updated_at
  BEFORE UPDATE ON public.ad_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
