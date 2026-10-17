-- ================================================================
-- Owner Wallet: rent earnings, platform fees, and payout requests
-- ================================================================

CREATE TABLE IF NOT EXISTS owner_earnings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id        UUID NOT NULL REFERENCES rent_schedules(id) ON DELETE CASCADE,
  transaction_id     UUID REFERENCES transactions(id) ON DELETE SET NULL,
  property_id        UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  agreement_id       UUID NOT NULL REFERENCES rental_agreements(id) ON DELETE CASCADE,
  gross_rent_amount  INTEGER NOT NULL CHECK (gross_rent_amount >= 0),
  fee_rate_bps       INTEGER NOT NULL DEFAULT 700 CHECK (fee_rate_bps >= 0 AND fee_rate_bps <= 10000),
  fee_amount         INTEGER NOT NULL CHECK (fee_amount >= 0),
  net_amount         INTEGER NOT NULL CHECK (net_amount >= 0),
  currency           TEXT NOT NULL DEFAULT 'XOF',
  earned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT owner_earnings_schedule_unique UNIQUE (schedule_id),
  CONSTRAINT owner_earnings_amounts_match CHECK (net_amount = gross_rent_amount - fee_amount)
);

CREATE INDEX IF NOT EXISTS idx_owner_earnings_owner_id ON owner_earnings(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_earnings_property_id ON owner_earnings(property_id);
CREATE INDEX IF NOT EXISTS idx_owner_earnings_earned_at ON owner_earnings(earned_at DESC);

CREATE TABLE IF NOT EXISTS owner_payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_id        UUID NOT NULL UNIQUE,
  amount           INTEGER NOT NULL CHECK (amount > 0),
  currency         TEXT NOT NULL DEFAULT 'XOF',
  provider         TEXT NOT NULL,
  recipient_phone  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'requested',
  failure_reason   TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  CONSTRAINT owner_payouts_status_check CHECK (
    status IN ('requested', 'accepted', 'processing', 'enqueued', 'completed', 'failed', 'rejected', 'not_found')
  )
);

CREATE INDEX IF NOT EXISTS idx_owner_payouts_owner_id ON owner_payouts(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_payouts_status ON owner_payouts(status);
CREATE INDEX IF NOT EXISTS idx_owner_payouts_created_at ON owner_payouts(created_at DESC);

CREATE TABLE IF NOT EXISTS owner_payout_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id   UUID NOT NULL REFERENCES owner_payouts(id) ON DELETE CASCADE,
  earning_id  UUID NOT NULL REFERENCES owner_earnings(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_owner_payout_items_payout_id ON owner_payout_items(payout_id);
CREATE INDEX IF NOT EXISTS idx_owner_payout_items_earning_id ON owner_payout_items(earning_id);

-- An earning can be tied to one active/completed payout at a time. Failed payouts set released_at,
-- making the rent credit selectable again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_payout_items_active_earning_unique
  ON owner_payout_items(earning_id)
  WHERE released_at IS NULL;

CREATE OR REPLACE TRIGGER owner_earnings_updated_at
  BEFORE UPDATE ON owner_earnings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER owner_payouts_updated_at
  BEFORE UPDATE ON owner_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
  WHERE NOT EXISTS (
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

-- Backfill paid rent schedules as individual full-rent credits.
INSERT INTO owner_earnings (
  owner_id,
  schedule_id,
  transaction_id,
  property_id,
  agreement_id,
  gross_rent_amount,
  fee_rate_bps,
  fee_amount,
  net_amount,
  currency,
  earned_at
)
SELECT
  rs.owner_id,
  rs.id,
  rs.transaction_id,
  rs.property_id,
  rs.agreement_id,
  rs.amount,
  700,
  ROUND(rs.amount * 700.0 / 10000.0)::INTEGER,
  rs.amount - ROUND(rs.amount * 700.0 / 10000.0)::INTEGER,
  COALESCE(t.currency, 'XOF'),
  COALESCE(rs.paid_at, rs.updated_at, NOW())
FROM rent_schedules rs
LEFT JOIN transactions t ON t.id = rs.transaction_id
WHERE rs.status = 'paid'
ON CONFLICT (schedule_id) DO NOTHING;
