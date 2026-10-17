-- Add 'rent_payment' to the transaction_type enum.
-- The type was created before the numbered migrations; the mobile/web code
-- started sending this value as part of the rent-payment flow but the enum
-- was never updated.

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'rent_payment';
