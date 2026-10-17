-- ================================================================
-- Rental Lifecycle: Tenant attribution, agreements, rent schedules
-- ================================================================

-- 1. Extend properties with dos_and_donts
ALTER TABLE properties ADD COLUMN IF NOT EXISTS dos_and_donts TEXT[] DEFAULT '{}';

-- 2. Extend applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Extend applications.status to include 'attributed'
-- (status is typically a TEXT column — no enum change needed)

-- 3. Create rental_agreements table
CREATE TABLE IF NOT EXISTS rental_agreements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  renter_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id    UUID REFERENCES applications(id) ON DELETE SET NULL,
  transaction_id    UUID REFERENCES transactions(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
    -- draft | sent | renter_signed | owner_signed | active | terminated
  monthly_rent      INTEGER NOT NULL,
  caution_mois      INTEGER NOT NULL DEFAULT 1,
  dos_and_donts     TEXT[] NOT NULL DEFAULT '{}',
  interdictions     TEXT[] NOT NULL DEFAULT '{}',
  terms_text        TEXT,
  start_date        DATE,
  end_date          DATE,
  owner_signed_at   TIMESTAMPTZ,
  renter_signed_at  TIMESTAMPTZ,
  pdf_url           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rental_agreements_property_id ON rental_agreements(property_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_owner_id    ON rental_agreements(owner_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_renter_id   ON rental_agreements(renter_id);

-- 4. Create rent_schedules table
CREATE TABLE IF NOT EXISTS rent_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id    UUID NOT NULL REFERENCES rental_agreements(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  renter_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_date        DATE NOT NULL,
  amount          INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'upcoming',
    -- upcoming | paid | overdue | waived
  transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rent_schedules_agreement_id ON rent_schedules(agreement_id);
CREATE INDEX IF NOT EXISTS idx_rent_schedules_renter_id    ON rent_schedules(renter_id);
CREATE INDEX IF NOT EXISTS idx_rent_schedules_owner_id     ON rent_schedules(owner_id);
CREATE INDEX IF NOT EXISTS idx_rent_schedules_due_date     ON rent_schedules(due_date);

-- 5. updated_at trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER rental_agreements_updated_at
  BEFORE UPDATE ON rental_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER rent_schedules_updated_at
  BEFORE UPDATE ON rent_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS policies
ALTER TABLE rental_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_schedules    ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by backend API)
-- No additional policies needed for server-side access via service key.
