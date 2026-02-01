-- Create account deletion requests table
CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    reason TEXT NOT NULL,
    additional_info TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_deletion_requests_email ON account_deletion_requests(email);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user_id ON account_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON account_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_requested_at ON account_deletion_requests(requested_at DESC);

-- Add RLS policies
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read all deletion requests
CREATE POLICY "Admins can view all deletion requests" ON account_deletion_requests
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'admin');

-- Policy: Anyone can insert their own deletion request
CREATE POLICY "Anyone can submit deletion request" ON account_deletion_requests
    FOR INSERT
    WITH CHECK (true);

-- Policy: Only admins can update deletion requests
CREATE POLICY "Admins can update deletion requests" ON account_deletion_requests
    FOR UPDATE
    USING (auth.jwt() ->> 'role' = 'admin');

COMMENT ON TABLE account_deletion_requests IS 'Stores account deletion requests from users for GDPR compliance';
