-- ================================================================
-- Daily rental request-to-book lifecycle
-- ================================================================

CREATE TABLE IF NOT EXISTS public.daily_booking_requests (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id                UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id                   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  renter_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  transaction_id             UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  agreement_id               UUID REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  status                     TEXT NOT NULL DEFAULT 'requested',
  start_date                 DATE NOT NULL,
  end_date                   DATE NOT NULL,
  checkin_at                 TIMESTAMPTZ NOT NULL,
  checkout_at                TIMESTAMPTZ NOT NULL,
  guest_count                INTEGER NOT NULL DEFAULT 1 CHECK (guest_count > 0),
  nightly_rate               INTEGER NOT NULL CHECK (nightly_rate >= 0),
  nights                     INTEGER NOT NULL CHECK (nights > 0),
  stay_amount                INTEGER NOT NULL CHECK (stay_amount >= 0),
  original_caution_amount    INTEGER NOT NULL DEFAULT 0 CHECK (original_caution_amount >= 0),
  caution_amount             INTEGER NOT NULL DEFAULT 0 CHECK (caution_amount >= 0),
  caution_cap_amount         INTEGER NOT NULL DEFAULT 0 CHECK (caution_cap_amount >= 0),
  renter_service_fee_bps     INTEGER NOT NULL DEFAULT 0 CHECK (renter_service_fee_bps >= 0),
  renter_service_fee_amount  INTEGER NOT NULL DEFAULT 0 CHECK (renter_service_fee_amount >= 0),
  owner_commission_bps       INTEGER NOT NULL DEFAULT 0 CHECK (owner_commission_bps >= 0),
  owner_commission_amount    INTEGER NOT NULL DEFAULT 0 CHECK (owner_commission_amount >= 0),
  owner_net_amount           INTEGER NOT NULL CHECK (owner_net_amount >= 0),
  total_amount               INTEGER NOT NULL CHECK (total_amount >= 0),
  currency                   TEXT NOT NULL DEFAULT 'XOF',
  expires_at                 TIMESTAMPTZ NOT NULL,
  approved_at                TIMESTAMPTZ,
  declined_at                TIMESTAMPTZ,
  payment_expires_at         TIMESTAMPTZ,
  payment_started_at         TIMESTAMPTZ,
  paid_at                    TIMESTAMPTZ,
  checkin_confirmed_at       TIMESTAMPTZ,
  checkout_reported_at       TIMESTAMPTZ,
  completed_at               TIMESTAMPTZ,
  issue_hold_until           TIMESTAMPTZ,
  metadata                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_booking_requests_status_check CHECK (
    status IN (
      'requested',
      'request_declined',
      'request_expired',
      'approved_awaiting_payment',
      'payment_pending',
      'payment_expired',
      'confirmed',
      'checked_in',
      'checkin_issue',
      'checkout_reported',
      'post_checkout_review',
      'issue_open',
      'completed',
      'cancelled',
      'refunded'
    )
  ),
  CONSTRAINT daily_booking_requests_valid_dates CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_booking_requests_property_dates
  ON public.daily_booking_requests(property_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_daily_booking_requests_owner_status
  ON public.daily_booking_requests(owner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_booking_requests_renter_status
  ON public.daily_booking_requests(renter_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_booking_requests_expires
  ON public.daily_booking_requests(status, expires_at)
  WHERE status = 'requested';

CREATE INDEX IF NOT EXISTS idx_daily_booking_requests_payment_expires
  ON public.daily_booking_requests(status, payment_expires_at)
  WHERE status IN ('approved_awaiting_payment', 'payment_pending');

CREATE INDEX IF NOT EXISTS idx_daily_booking_requests_checkout
  ON public.daily_booking_requests(status, checkout_at)
  WHERE status IN ('confirmed', 'checked_in', 'checkout_reported', 'post_checkout_review');

CREATE OR REPLACE TRIGGER daily_booking_requests_updated_at
  BEFORE UPDATE ON public.daily_booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.daily_booking_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.daily_booking_issues (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id UUID NOT NULL REFERENCES public.daily_booking_requests(id) ON DELETE CASCADE,
  agreement_id        UUID REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  property_id         UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  reporter_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reporter_role       TEXT NOT NULL CHECK (reporter_role IN ('renter', 'owner', 'staff')),
  issue_type          TEXT NOT NULL,
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  resolution_note     TEXT,
  resolved_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_booking_issues_status_check CHECK (
    status IN ('open', 'resolved', 'dismissed')
  )
);

CREATE INDEX IF NOT EXISTS idx_daily_booking_issues_request_status
  ON public.daily_booking_issues(booking_request_id, status);

CREATE INDEX IF NOT EXISTS idx_daily_booking_issues_open
  ON public.daily_booking_issues(status, created_at DESC)
  WHERE status = 'open';

CREATE OR REPLACE TRIGGER daily_booking_issues_updated_at
  BEFORE UPDATE ON public.daily_booking_issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.daily_booking_issues ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.property_blocked_dates
  ADD COLUMN IF NOT EXISTS booking_request_id UUID REFERENCES public.daily_booking_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_blocked_dates_booking_request
  ON public.property_blocked_dates(booking_request_id)
  WHERE booking_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blocked_dates_booking_hold_expiry
  ON public.property_blocked_dates(expires_at)
  WHERE block_type = 'booking_hold';
