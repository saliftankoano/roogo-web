// Canonical property types — must stay in sync with roogo mobile: forms/listingSchema.ts PROPERTY_TYPE_IDS
export const PROPERTY_TYPE_IDS = [
  "villa",
  "appartement",
  "maison",
  "terrain",
  "commercial",
  "célibatorium",
] as const;
export type PropertyTypeId = (typeof PROPERTY_TYPE_IDS)[number];

// Time constants
export const BOOST_DURATION_DAYS = 7;
// @deprecated - Early Bird duration is now configured dynamically in the database via early_bird_config table.
// This constant is kept for backward compatibility but is no longer used in the application.
// Use the early_bird_config.duration_hours value from the database instead.
export const LOCK_DURATION_HOURS = 48;
export const LOCK_EXTENSION_HOURS = 72;
export const LOCK_EXPIRY_REMINDER_DAYS = 7;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Rate limits
export const PAYMENT_RATE_LIMIT = { requests: 5, window: "1 m" } as const;
export const LISTING_RATE_LIMIT = { requests: 10, window: "1 h" } as const;

