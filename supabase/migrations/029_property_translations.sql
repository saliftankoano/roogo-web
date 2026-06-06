BEGIN;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS translation_source_locale TEXT NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS translation_status TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS translation_source_hash TEXT,
  ADD COLUMN IF NOT EXISTS translation_last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS translated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS translation_error TEXT;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_translation_source_locale_check,
  ADD CONSTRAINT properties_translation_source_locale_check
    CHECK (translation_source_locale IN ('fr', 'en')),
  DROP CONSTRAINT IF EXISTS properties_translation_status_check,
  ADD CONSTRAINT properties_translation_status_check
    CHECK (translation_status IN ('not_requested', 'translated', 'failed', 'skipped'));

COMMENT ON COLUMN public.properties.translation_source_locale IS
  'Locale of owner-entered free text used as the translation source.';
COMMENT ON COLUMN public.properties.translation_status IS
  'Status of generated listing translations for owner-entered free text.';
COMMENT ON COLUMN public.properties.translations IS
  'Generated listing translations keyed by locale, e.g. translations.en.description.';
COMMENT ON COLUMN public.properties.translation_source_hash IS
  'Stable hash of source free text that the current translation status applies to.';
COMMENT ON COLUMN public.properties.translation_last_attempted_at IS
  'Timestamp of the latest server-side translation evaluation or provider attempt.';

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
