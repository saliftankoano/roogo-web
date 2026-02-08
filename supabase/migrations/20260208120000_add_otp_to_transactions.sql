-- Migration: Add otp_code to transactions table
-- Created: 2026-02-08
-- Description: Adds otp_code column to track Orange Money OTP codes for debugging and cross-referencing.

-- Add otp_code column
ALTER TABLE transactions
ADD COLUMN otp_code text;

-- Add comment explaining the column
COMMENT ON COLUMN transactions.otp_code IS 'Orange Money OTP code (preAuthorisationCode) used for the transaction. Used for debugging and cross-referencing with PawaPay.';

-- Add index for faster filtering by OTP code
CREATE INDEX IF NOT EXISTS idx_transactions_otp_code ON transactions(otp_code) WHERE otp_code IS NOT NULL;
