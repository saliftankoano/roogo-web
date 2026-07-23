-- 051: Add 'hotel' user type and 'hotel' property type
-- Standalone migration: ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction as statements that reference the new value (see 008).

ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_user_types;
ALTER TABLE users ADD CONSTRAINT valid_user_types
CHECK (user_type IN ('owner', 'agent', 'renter', 'staff', 'founder', 'hotel'));
COMMENT ON COLUMN users.user_type IS 'User type: owner (property owner), agent (real estate agent), renter (looking for property), staff (Roogo team member), founder (company founder), hotel (hotel admin or receptionist; capability comes from hotel_members.role)';

ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'hotel';
