-- Migration: Add environment tracking to transactions table
-- Created: 2026-02-05
-- Description: Adds environment column to track if transaction is from sandbox or live PawaPay

-- Add environment column with CHECK constraint
ALTER TABLE transactions
ADD COLUMN environment text NOT NULL DEFAULT 'sandbox'
CHECK (environment IN ('sandbox', 'live'));

-- Set all existing transactions to sandbox
UPDATE transactions
SET environment = 'sandbox'
WHERE environment IS NULL OR environment = '';

-- Add index for faster filtering by environment
CREATE INDEX IF NOT EXISTS idx_transactions_environment ON transactions(environment);

-- Add comment explaining the column
COMMENT ON COLUMN transactions.environment IS 'Tracks which PawaPay environment (sandbox or live) was used for this transaction. Defaults to sandbox for safety.';

-- Verify the migration
SELECT 
  COUNT(*) as total_transactions,
  COUNT(*) FILTER (WHERE environment = 'sandbox') as sandbox_count,
  COUNT(*) FILTER (WHERE environment = 'live') as live_count
FROM transactions;
