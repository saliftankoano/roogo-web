// Shared constants for the property-selling feature (Roogo Sell, broker model).
// Keep in sync with the mobile mirror at roogo/constants/sale.ts.
//
// Economics v2 (migration 050): the owner names the amount they want to receive
// (desired_price). Roogo takes a base commission on that amount plus a share of any
// surplus when the sale closes above it. The percentages live on listing_config
// (founder-editable) and are snapshotted onto each mandate at send time. The seller
// never sees Roogo's public listing price (properties.price), which staff set and
// adjust freely. See lib/sale-mandate.ts and migrations 042 + 050.

// Bump when the seller-facing mandate terms text changes, so each signed mandate
// records exactly which version was agreed to.
export const MANDATE_TERMS_VERSION = "2026-07-v2";

// Default exclusivity period Roogo proposes on a mandate, in days.
export const DEFAULT_MANDATE_EXCLUSIVITY_DAYS = 90;
