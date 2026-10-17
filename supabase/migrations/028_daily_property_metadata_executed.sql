BEGIN;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS frequence TEXT NOT NULL DEFAULT 'mensuel',
  ADD COLUMN IF NOT EXISTS sejour_minimum INTEGER,
  ADD COLUMN IF NOT EXISTS capacite_max INTEGER,
  ADD COLUMN IF NOT EXISTS caution_type TEXT,
  ADD COLUMN IF NOT EXISTS caution_valeur INTEGER;

UPDATE public.properties
SET
  period = CASE
    WHEN period = 'day' OR frequence = 'journalier' THEN 'day'
    WHEN period IN ('month', 'monthly', 'mois') OR frequence = 'mensuel' THEN 'month'
    ELSE period
  END,
  frequence = CASE
    WHEN period = 'day' OR frequence = 'journalier' THEN 'journalier'
    ELSE 'mensuel'
  END,
  sejour_minimum = CASE
    WHEN period = 'day' OR frequence = 'journalier' THEN COALESCE(sejour_minimum, 1)
    ELSE NULL
  END,
  capacite_max = CASE
    WHEN period = 'day' OR frequence = 'journalier' THEN COALESCE(capacite_max, 2)
    ELSE NULL
  END,
  caution_type = CASE
    WHEN period = 'day' OR frequence = 'journalier' THEN COALESCE(caution_type, 'aucune')
    ELSE NULL
  END,
  caution_valeur = CASE
    WHEN period = 'day' OR frequence = 'journalier' THEN COALESCE(caution_valeur, 0)
    ELSE NULL
  END
WHERE
  (period = 'day' AND frequence IS DISTINCT FROM 'journalier')
  OR (frequence = 'journalier' AND period IS DISTINCT FROM 'day')
  OR (period <> 'day' AND frequence IS DISTINCT FROM 'mensuel')
  OR (period = 'day' AND sejour_minimum IS NULL)
  OR (period = 'day' AND capacite_max IS NULL)
  OR (period = 'day' AND caution_type IS NULL)
  OR (period = 'day' AND caution_valeur IS NULL)
  OR (period <> 'day' AND (
    sejour_minimum IS NOT NULL
    OR capacite_max IS NOT NULL
    OR caution_type IS NOT NULL
    OR caution_valeur IS NOT NULL
  ));

ALTER TABLE public.properties
  ALTER COLUMN frequence SET DEFAULT 'mensuel',
  ALTER COLUMN frequence SET NOT NULL,
  DROP CONSTRAINT IF EXISTS properties_frequence_check,
  ADD CONSTRAINT properties_frequence_check
    CHECK (frequence IN ('mensuel', 'journalier')),
  DROP CONSTRAINT IF EXISTS properties_daily_caution_type_check,
  ADD CONSTRAINT properties_daily_caution_type_check
    CHECK (caution_type IS NULL OR caution_type IN ('aucune', 'pourcentage', 'fixe')),
  DROP CONSTRAINT IF EXISTS properties_daily_stay_minimum_check,
  ADD CONSTRAINT properties_daily_stay_minimum_check
    CHECK (sejour_minimum IS NULL OR sejour_minimum BETWEEN 1 AND 30),
  DROP CONSTRAINT IF EXISTS properties_daily_capacity_check,
  ADD CONSTRAINT properties_daily_capacity_check
    CHECK (capacite_max IS NULL OR capacite_max BETWEEN 1 AND 20),
  DROP CONSTRAINT IF EXISTS properties_daily_caution_value_check,
  ADD CONSTRAINT properties_daily_caution_value_check
    CHECK (caution_valeur IS NULL OR caution_valeur BETWEEN 0 AND 50000);

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
