-- Referral / Pro Agent pilot

CREATE TABLE IF NOT EXISTS referrer_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code              TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending',
  legal_name        TEXT NOT NULL,
  city_zone         TEXT NOT NULL,
  payout_phone      TEXT NOT NULL,
  payout_provider   TEXT NOT NULL,
  id_front_path     TEXT NOT NULL,
  id_back_path      TEXT NOT NULL,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrer_profiles_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  CONSTRAINT referrer_profiles_payout_provider_check
    CHECK (payout_provider IN ('ORANGE_MONEY', 'MOOV_MONEY'))
);

CREATE INDEX IF NOT EXISTS idx_referrer_profiles_status
  ON referrer_profiles(status);
CREATE INDEX IF NOT EXISTS idx_referrer_profiles_submitted_at
  ON referrer_profiles(submitted_at DESC);

CREATE TABLE IF NOT EXISTS referral_redemptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_profile_id  UUID NOT NULL REFERENCES referrer_profiles(id) ON DELETE CASCADE,
  referred_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_used            TEXT NOT NULL,
  transaction_id       UUID UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
  property_id          UUID REFERENCES properties(id) ON DELETE SET NULL,
  original_amount      INTEGER NOT NULL CHECK (original_amount >= 0),
  discount_amount      INTEGER NOT NULL CHECK (discount_amount >= 0),
  paid_amount          INTEGER NOT NULL CHECK (paid_amount >= 0),
  status               TEXT NOT NULL DEFAULT 'pending_payment',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_redemptions_status_check
    CHECK (status IN ('pending_payment', 'qualified', 'void')),
  CONSTRAINT referral_redemptions_amounts_match
    CHECK (paid_amount = original_amount - discount_amount)
);

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referrer_profile_id
  ON referral_redemptions(referrer_profile_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referred_user_id
  ON referral_redemptions(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_status
  ON referral_redemptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_redemptions_one_qualified_per_user
  ON referral_redemptions(referred_user_id)
  WHERE status = 'qualified';

CREATE TABLE IF NOT EXISTS referral_commissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id        UUID NOT NULL UNIQUE REFERENCES referral_redemptions(id) ON DELETE CASCADE,
  referrer_profile_id  UUID NOT NULL REFERENCES referrer_profiles(id) ON DELETE CASCADE,
  amount               INTEGER NOT NULL CHECK (amount >= 0),
  currency             TEXT NOT NULL DEFAULT 'XOF',
  status               TEXT NOT NULL DEFAULT 'pending',
  paid_at              TIMESTAMPTZ,
  paid_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  payout_reference     TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_commissions_status_check
    CHECK (status IN ('pending', 'approved', 'paid', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer_profile_id
  ON referral_commissions(referrer_profile_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status
  ON referral_commissions(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_created_at
  ON referral_commissions(created_at DESC);

CREATE OR REPLACE TRIGGER referrer_profiles_updated_at
  BEFORE UPDATE ON referrer_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER referral_redemptions_updated_at
  BEFORE UPDATE ON referral_redemptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER referral_commissions_updated_at
  BEFORE UPDATE ON referral_commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE referrer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_commissions ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('referrer-verification', 'referrer-verification', false)
ON CONFLICT (id) DO UPDATE SET public = false;
