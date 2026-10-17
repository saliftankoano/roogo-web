-- Remove the title column from properties table.
-- Title is redundant — the property location (quartier + city) is the natural identifier.
-- All display, search, and notification code has been updated to use address/quartier instead.
--
-- The property_details view depends on p.* which includes title, so we must drop and recreate it.

DROP VIEW IF EXISTS property_details;

ALTER TABLE properties DROP COLUMN IF EXISTS title;

-- Recreate property_details without title (p.* no longer includes it)
CREATE VIEW property_details AS
SELECT
    p.*,
    u.full_name as agent_name,
    u.avatar_url as agent_avatar,
    u.phone as agent_phone,
    u.email as agent_email,
    u.user_type as agent_type,
    r.full_name as renter_name,
    r.phone as renter_phone,
    r.email as renter_email,
    r.avatar_url as renter_avatar,
    pl.locked_at as lock_timestamp,
    pl.status as lock_status,
    ARRAY_AGG(DISTINCT a.name) as amenities,
    ARRAY_AGG(DISTINCT pi.url) as images,
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
