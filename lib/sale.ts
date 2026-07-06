// Shared constants for the property-selling feature (Roogo Sell, broker model).
// Keep in sync with the mobile mirror at roogo/constants/sale.ts.
//
// Roogo is not paid a commission. The owner names a net price (seller_asking_price);
// Roogo sets a higher public sale price (properties.price) via a signed mandate and
// keeps the spread. See lib/sale-mandate.ts and migration 042.

// Bump when the seller-facing mandate terms text (price + exclusivity) changes, so
// each signed mandate records exactly which version was agreed to.
export const MANDATE_TERMS_VERSION = "2026-06-v1";

// Default exclusivity period Roogo proposes on a mandate, in days.
export const DEFAULT_MANDATE_EXCLUSIVITY_DAYS = 90;
