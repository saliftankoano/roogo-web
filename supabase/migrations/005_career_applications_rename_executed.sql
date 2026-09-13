-- Create table if it doesn't exist (Hustle naming)
CREATE TABLE IF NOT EXISTS hustle_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  secondary_phone TEXT,
  proud_achievement TEXT,
  difficult_problem TEXT,
  thirty_day_strategy TEXT,
  proof_links TEXT,
  neighborhood_challenge TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- If the table already existed with an old schema (e.g. from spontaneous_applications rename),
-- we need to make sure 'value_proposition' is not blocking inserts.
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hustle_applications' AND column_name='value_proposition') THEN
        ALTER TABLE hustle_applications ALTER COLUMN value_proposition DROP NOT NULL;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE hustle_applications ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Service role can insert" ON hustle_applications;
CREATE POLICY "Service role can insert"
  ON hustle_applications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can select" ON hustle_applications;
CREATE POLICY "Service role can select"
  ON hustle_applications
  FOR SELECT
  TO service_role
  USING (true);
