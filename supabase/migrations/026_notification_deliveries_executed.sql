-- ================================================================
-- Notification delivery log: idempotency and renter listing caps
-- ================================================================

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  subject_id        TEXT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_on           DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_event_unique
  ON notification_deliveries(user_id, event_type, subject_id);

CREATE INDEX IF NOT EXISTS notification_deliveries_user_event_sent_at_idx
  ON notification_deliveries(user_id, event_type, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_new_listing_daily_unique
  ON notification_deliveries(user_id, event_type, sent_on)
  WHERE event_type = 'properties.newMatch';

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Delivery logs are server-managed through service-role API routes only.
