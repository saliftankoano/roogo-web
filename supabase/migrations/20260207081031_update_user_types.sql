-- Migration: Update user_type constraint to match app types
-- Changes: buyer -> renter, add agent type, remove admin (use staff instead)

BEGIN;

-- 1. First, DROP the old constraint (before updating data!)
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_user_types;

-- 2. Now update existing 'buyer' records to 'renter'
UPDATE users 
SET user_type = 'renter' 
WHERE user_type = 'buyer';

-- 3. Update any existing 'admin' records to 'staff'
UPDATE users 
SET user_type = 'staff' 
WHERE user_type = 'admin';

-- 4. Create new constraint with simplified app-aligned types
ALTER TABLE users ADD CONSTRAINT valid_user_types 
CHECK (user_type IN ('owner', 'agent', 'renter', 'staff', 'founder'));

-- 5. Add comment explaining the types
COMMENT ON COLUMN users.user_type IS 'User type: owner (property owner), agent (real estate agent), renter (looking for property), staff (Roogo team member), founder (company founder)';

COMMIT;
