CREATE TABLE IF NOT EXISTS spontaneous_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  question1_answer TEXT,
  question2_answer TEXT,
  value_proposition TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE spontaneous_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can insert" ON spontaneous_applications;
CREATE POLICY "Service role can insert"
  ON spontaneous_applications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can select" ON spontaneous_applications;
CREATE POLICY "Service role can select"
  ON spontaneous_applications
  FOR SELECT
  TO service_role
  USING (true);
