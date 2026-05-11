-- Daily booking monetization: daily stay earnings become withdrawable at check-in.

ALTER TABLE owner_earnings
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE owner_earnings
  DROP CONSTRAINT IF EXISTS owner_earnings_source_exclusive;

ALTER TABLE owner_earnings
  ADD CONSTRAINT owner_earnings_source_exclusive CHECK (
    (source_type = 'rent' AND schedule_id IS NOT NULL AND hold_id IS NULL)
    OR
    (source_type = 'deposit_split' AND hold_id IS NOT NULL AND schedule_id IS NULL)
    OR
    (source_type = 'daily_stay' AND schedule_id IS NULL AND hold_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS owner_earnings_daily_transaction_unique
  ON owner_earnings(transaction_id)
  WHERE source_type = 'daily_stay' AND transaction_id IS NOT NULL;

DROP VIEW IF EXISTS owner_wallet_summary;

CREATE OR REPLACE VIEW owner_wallet_summary AS
SELECT
  owner_ids.owner_id,
  COALESCE(earnings.gross_rent_earned, 0)::INTEGER AS gross_rent_earned,
  COALESCE(earnings.platform_fees, 0)::INTEGER AS platform_fees,
  COALESCE(earnings.net_rent_earned, 0)::INTEGER AS net_rent_earned,
  COALESCE(earnings.total_rent_credits, 0)::INTEGER AS total_rent_credits,
  COALESCE(available.available_balance, 0)::INTEGER AS available_balance,
  COALESCE(available.available_rent_credits, 0)::INTEGER AS available_rent_credits,
  COALESCE(payouts.pending_payouts, 0)::INTEGER AS pending_payouts,
  COALESCE(payouts.completed_payouts, 0)::INTEGER AS completed_payouts
FROM (
  SELECT owner_id FROM owner_earnings
  UNION
  SELECT owner_id FROM owner_payouts
) owner_ids
LEFT JOIN (
  SELECT
    owner_id,
    SUM(gross_rent_amount) AS gross_rent_earned,
    SUM(fee_amount) AS platform_fees,
    SUM(net_amount) AS net_rent_earned,
    COUNT(*) AS total_rent_credits
  FROM owner_earnings
  GROUP BY owner_id
) earnings ON earnings.owner_id = owner_ids.owner_id
LEFT JOIN (
  SELECT
    e.owner_id,
    SUM(e.net_amount) AS available_balance,
    COUNT(*) AS available_rent_credits
  FROM owner_earnings e
  WHERE e.available_at <= NOW()
    AND NOT EXISTS (
      SELECT 1
      FROM owner_payout_items pi
      WHERE pi.earning_id = e.id
        AND pi.released_at IS NULL
    )
  GROUP BY e.owner_id
) available ON available.owner_id = owner_ids.owner_id
LEFT JOIN (
  SELECT
    owner_id,
    SUM(amount) FILTER (WHERE status IN ('requested', 'accepted', 'processing', 'enqueued')) AS pending_payouts,
    SUM(amount) FILTER (WHERE status = 'completed') AS completed_payouts
  FROM owner_payouts
  GROUP BY owner_id
) payouts ON payouts.owner_id = owner_ids.owner_id;
