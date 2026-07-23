-- 057: Quartier data cleanup + one-time slug regeneration.
-- The 056 slugs leaked the raw city id ("ouaga") and messy free-text
-- quartiers (ALL-CAPS, typos, legacy HTML entities, one full sentence).
-- Slugs are hours old and barely indexed, so we regenerate them ONCE with
-- the city display label and cleaned quartiers. Legacy uuid URLs still 308
-- via the app code. Keep the slug logic in sync with
-- lib/property-url.ts::buildPropertyBaseSlug.

BEGIN;

-- 1) Legacy HTML entities written by the old validator.escape() path.
UPDATE public.properties
SET quartier = replace(replace(replace(quartier, '&#x27;', ''''), '&amp;', '&'), '&quot;', '"')
WHERE quartier LIKE '%&#x27;%' OR quartier LIKE '%&amp;%' OR quartier LIKE '%&quot;%';

-- 2) Targeted fixes for known-bad values.
UPDATE public.properties SET quartier = 'Karpala' WHERE quartier IN ('KARPALA', 'Kaarpala', 'kaarpala');
UPDATE public.properties SET quartier = 'Rimkieta' WHERE quartier LIKE 'Rimkieta %';

-- 3) Generic ALL-CAPS quartiers ("TOEYIBIN" -> "Toeyibin").
UPDATE public.properties
SET quartier = initcap(lower(quartier))
WHERE length(quartier) > 3
  AND quartier = upper(quartier)
  AND quartier <> lower(quartier);

-- 4) Regenerate every slug with the city label and an 80-char cap.
UPDATE public.properties SET slug = NULL;

WITH labeled AS (
  SELECT
    id,
    created_at,
    property_type,
    bedrooms,
    listing_type,
    quartier,
    CASE lower(trim(coalesce(city, '')))
      WHEN 'ouaga' THEN 'Ouagadougou'
      WHEN 'bobo' THEN 'Bobo-Dioulasso'
      WHEN 'banfora' THEN 'Banfora'
      WHEN 'po' THEN 'Pô'
      WHEN 'cinkasse' THEN 'Cinkassé'
      WHEN 'kaya' THEN 'Kaya'
      WHEN 'koudougou' THEN 'Koudougou'
      WHEN 'manga' THEN 'Manga'
      WHEN 'ouahigouya' THEN 'Ouahigouya'
      WHEN 'tenkodogo' THEN 'Tenkodogo'
      WHEN 'yako' THEN 'Yako'
      WHEN 'dedougou' THEN 'Dédougou'
      WHEN 'koupela' THEN 'Koupéla'
      WHEN 'zorgho' THEN 'Zorgho'
      ELSE nullif(trim(city), '')
    END AS city_label
  FROM public.properties
),
base AS (
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
        CASE WHEN lower(coalesce(city_label, '')) <> lower(trim(coalesce(quartier, '')))
          THEN city_label
        END
      ))),
      '[^a-z0-9]+', '-', 'g'
    )) AS raw_slug
  FROM labeled
),
capped AS (
  SELECT
    id,
    created_at,
    CASE
      WHEN length(raw_slug) > 80
        THEN regexp_replace(left(raw_slug, 80), '-[^-]*$', '')
      ELSE raw_slug
    END AS base_slug
  FROM base
),
ranked AS (
  SELECT
    id,
    coalesce(nullif(base_slug, ''), 'propriete') AS base_slug,
    row_number() OVER (
      PARTITION BY coalesce(nullif(base_slug, ''), 'propriete')
      ORDER BY created_at, id
    ) AS rn
  FROM capped
)
UPDATE public.properties p
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.rn END
FROM ranked r
WHERE p.id = r.id;

COMMIT;
