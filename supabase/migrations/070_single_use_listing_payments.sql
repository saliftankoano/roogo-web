-- A hosted listing payment can fund at most one property. This closes both
-- concurrent submission races and stale browser/deep-link replay.
CREATE UNIQUE INDEX IF NOT EXISTS properties_payment_id_unique
  ON public.properties(payment_id)
  WHERE payment_id IS NOT NULL;
