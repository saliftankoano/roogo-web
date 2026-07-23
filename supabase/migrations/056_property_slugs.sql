-- 056: SEO slugs for properties.
-- Adds properties.slug (unique, immutable after creation), backfills every
-- existing row with a descriptive French slug, and rebuilds property_details
-- so the new column (plus any column added since 044, e.g. hotel_id) flows
-- through p.*.
--
-- Slug shape: {type}[-{n}-chambres]-a-{louer|vendre}-{quartier}[-{ville}]
-- e.g. villa-3-chambres-a-louer-ouaga-2000-ouagadougou
-- New rows get their slug from the API create handler (same logic in
-- lib/property-url.ts); this backfill only covers pre-existing rows.

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS properties_slug_key
  ON public.properties (slug)
  WHERE slug IS NOT NULL;

WITH base AS (
  SELECT
    id,
    created_at,
    trim(both '-' FROM regexp_replace(
      lower(unaccent(concat_ws(' ',
        CASE lower(coalesce(property_type::text, ''))
          WHEN 'commercial' THEN 'local commercial'
          WHEN 'célibatorium' THEN 'celibatorium'
          ELSE coalesce(nullif(trim(property_type::text), ''), 'propriete')
        END,
        CASE WHEN coalesce(bedrooms, 0) > 0
          THEN bedrooms || ' chambres'
        END,
        CASE WHEN lower(coalesce(listing_type::text, 'louer')) = 'vendre'
          THEN 'a vendre'
          ELSE 'a louer'
        END,
        nullif(trim(quartier), ''),
        CASE WHEN lower(trim(coalesce(city, ''))) <> lower(trim(coalesce(quartier, '')))
          THEN nullif(trim(city), '')
        END
      ))),
      '[^a-z0-9]+', '-', 'g'
    )) AS base_slug
  FROM public.properties
  WHERE slug IS NULL
),
ranked AS (
  SELECT
    id,
    coalesce(nullif(base_slug, ''), 'propriete') AS base_slug,
    row_number() OVER (
      PARTITION BY coalesce(nullif(base_slug, ''), 'propriete')
      ORDER BY created_at, id
    ) AS rn
  FROM base
)
UPDATE public.properties p
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.rn END
FROM ranked r
WHERE p.id = r.id;

-- Rebuild property_details (definition from 044) so p.* picks up slug.
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
        SELECT COUNT(*) FROM public.favorites f WHERE f.property_id = p.id
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
