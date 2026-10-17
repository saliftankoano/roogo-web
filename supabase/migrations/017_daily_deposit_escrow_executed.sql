-- ================================================================
-- Daily-rental deposit escrow + dispute resolution
-- Holds the caution during a journalier stay, routes to PawaPay payouts
-- for renter refunds or owner dispute-split credits.
-- ================================================================

-- 1. deposit_holds ------------------------------------------------
-- One row per journalier rental_agreement. Caution collected at booking,
-- held by Roogo, and released via a state machine.

CREATE TABLE IF NOT EXISTS deposit_holds (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id            UUID NOT NULL UNIQUE REFERENCES rental_agreements(id) ON DELETE CASCADE,
  property_id             UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  renter_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount                  INTEGER NOT NULL CHECK (amount >= 0),
  currency                TEXT NOT NULL DEFAULT 'XOF',
  source_transaction_id   UUID REFERENCES transactions(id) ON DELETE SET NULL,
  renter_payout_phone     TEXT NOT NULL,
  renter_payout_provider  TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'held',
  stay_end_at             TIMESTAMPTZ NOT NULL,
  review_deadline_at      TIMESTAMPTZ NOT NULL,
  resolved_owner_amount   INTEGER CHECK (resolved_owner_amount IS NULL OR resolved_owner_amount >= 0),
  resolved_renter_amount  INTEGER CHECK (resolved_renter_amount IS NULL OR resolved_renter_amount >= 0),
  resolved_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at             TIMESTAMPTZ,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deposit_holds_status_check CHECK (
    status IN (
      'held',
      'pending_review',
      'disputed',
      'auto_refunded',
      'refunded_full',
      'resolved_split',
      'resolved_owner_full',
      'resolved_renter_full'
    )
  ),
  CONSTRAINT deposit_holds_resolved_sum_check CHECK (
    status NOT IN ('resolved_split', 'resolved_owner_full', 'resolved_renter_full')
    OR (
      resolved_owner_amount IS NOT NULL
      AND resolved_renter_amount IS NOT NULL
      AND resolved_owner_amount + resolved_renter_amount = amount
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_deposit_holds_owner_id ON deposit_holds(owner_id);
CREATE INDEX IF NOT EXISTS idx_deposit_holds_renter_id ON deposit_holds(renter_id);
CREATE INDEX IF NOT EXISTS idx_deposit_holds_status ON deposit_holds(status);
CREATE INDEX IF NOT EXISTS idx_deposit_holds_review_deadline
  ON deposit_holds(review_deadline_at)
  WHERE status = 'held';

CREATE OR REPLACE TRIGGER deposit_holds_updated_at
  BEFORE UPDATE ON deposit_holds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. deposit_claims ------------------------------------------------
-- One submitted claim per hold drives the disputed state. History preserved
-- via status='withdrawn' or 'resolved' rather than delete.

CREATE TABLE IF NOT EXISTS deposit_claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_id         UUID NOT NULL REFERENCES deposit_holds(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_amount  INTEGER NOT NULL CHECK (claimed_amount > 0),
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'submitted',
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deposit_claims_status_check CHECK (
    status IN ('submitted', 'withdrawn', 'resolved')
  )
);

CREATE INDEX IF NOT EXISTS idx_deposit_claims_hold_id ON deposit_claims(hold_id);
CREATE INDEX IF NOT EXISTS idx_deposit_claims_status ON deposit_claims(status);

-- At most one active claim per hold (submitted state).
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_claims_active_per_hold
  ON deposit_claims(hold_id)
  WHERE status = 'submitted';

CREATE OR REPLACE TRIGGER deposit_claims_updated_at
  BEFORE UPDATE ON deposit_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. deposit_claim_evidence ---------------------------------------
-- Photos uploaded by the owner to support a claim. Storage path points into
-- the 'deposit-evidence' Supabase Storage bucket.

CREATE TABLE IF NOT EXISTS deposit_claim_evidence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id      UUID NOT NULL REFERENCES deposit_claims(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    INTEGER,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deposit_claim_evidence_claim_id
  ON deposit_claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_deposit_claim_evidence_undeleted
  ON deposit_claim_evidence(claim_id)
  WHERE deleted_at IS NULL;

-- 4. deposit_refunds ----------------------------------------------
-- Renter-bound payouts for refunded caution amounts. Mirrors owner_payouts
-- so the PawaPay payout helper can write either.

CREATE TABLE IF NOT EXISTS deposit_refunds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_id          UUID NOT NULL REFERENCES deposit_holds(id) ON DELETE CASCADE,
  refund_id        UUID NOT NULL UNIQUE,
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
  CONSTRAINT deposit_refunds_status_check CHECK (
    status IN ('requested', 'accepted', 'processing', 'enqueued', 'completed', 'failed', 'rejected', 'not_found')
  )
);

CREATE INDEX IF NOT EXISTS idx_deposit_refunds_hold_id ON deposit_refunds(hold_id);
CREATE INDEX IF NOT EXISTS idx_deposit_refunds_status ON deposit_refunds(status);
CREATE INDEX IF NOT EXISTS idx_deposit_refunds_created_at
  ON deposit_refunds(created_at DESC);

CREATE OR REPLACE TRIGGER deposit_refunds_updated_at
  BEFORE UPDATE ON deposit_refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. owner_earnings: admit deposit-split credits ------------------
-- Rent and deposit-split earnings share the wallet pipeline. Relax
-- schedule_id NOT NULL / UNIQUE, add hold_id + source_type.

ALTER TABLE owner_earnings
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS hold_id UUID REFERENCES deposit_holds(id) ON DELETE CASCADE;

-- Make schedule_id nullable for deposit_split rows.
ALTER TABLE owner_earnings
  ALTER COLUMN schedule_id DROP NOT NULL;

-- Drop the old UNIQUE(schedule_id) — we need it conditional now.
ALTER TABLE owner_earnings
  DROP CONSTRAINT IF EXISTS owner_earnings_schedule_unique;

CREATE UNIQUE INDEX IF NOT EXISTS owner_earnings_schedule_unique
  ON owner_earnings(schedule_id)
  WHERE schedule_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS owner_earnings_hold_unique
  ON owner_earnings(hold_id)
  WHERE hold_id IS NOT NULL;

-- Exactly one of schedule_id / hold_id must be set, matching source_type.
ALTER TABLE owner_earnings
  DROP CONSTRAINT IF EXISTS owner_earnings_source_exclusive;

ALTER TABLE owner_earnings
  ADD CONSTRAINT owner_earnings_source_exclusive CHECK (
    (source_type = 'rent' AND schedule_id IS NOT NULL AND hold_id IS NULL)
    OR
    (source_type = 'deposit_split' AND hold_id IS NOT NULL AND schedule_id IS NULL)
  );

-- 6. owner_payout_items: 5% withdrawal fee on deposit_split -------
-- Stored as a per-item deduction so the summary view can report a total fee.

ALTER TABLE owner_payout_items
  ADD COLUMN IF NOT EXISTS withdrawal_fee_amount INTEGER NOT NULL DEFAULT 0
    CHECK (withdrawal_fee_amount >= 0);

-- 7. Private storage bucket for claim evidence --------------------
-- Access is mediated by server-signed URLs issued from supabaseAdmin; no RLS
-- on storage.objects is needed as the bucket is not publicly readable and
-- clients never touch storage directly without a signed URL.

INSERT INTO storage.buckets (id, name, public)
VALUES ('deposit-evidence', 'deposit-evidence', false)
ON CONFLICT (id) DO NOTHING;
