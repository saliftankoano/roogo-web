CREATE TABLE listing_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  commission_percentage NUMERIC NOT NULL DEFAULT 0.05,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_commission CHECK (commission_percentage >= 0 AND commission_percentage <= 1)
);

-- Seed with current value
INSERT INTO listing_config (id, commission_percentage) VALUES ('default', 0.05);

-- Enable RLS
ALTER TABLE listing_config ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can view pricing config)
CREATE POLICY "Anyone can read listing config"
  ON listing_config FOR SELECT
  TO public
  USING (true);

-- Only founders can update
CREATE POLICY "Only founders can update listing config"
  ON listing_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE clerk_id = auth.jwt() ->> 'sub' 
      AND user_type = 'founder'
    )
  );
