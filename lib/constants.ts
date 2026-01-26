// Time constants
export const BOOST_DURATION_DAYS = 7;
export const LOCK_DURATION_HOURS = 48;
export const LOCK_EXTENSION_HOURS = 72;
export const LOCK_EXPIRY_REMINDER_DAYS = 7;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Rate limits
export const PAYMENT_RATE_LIMIT = { requests: 5, window: "1 m" } as const;
export const LISTING_RATE_LIMIT = { requests: 10, window: "1 h" } as const;

// Tiers
export const TIERS_CONFIG = {
  essentiel: {
    photo_limit: 8,
    slot_limit: 25,
    video_included: false,
    open_house_limit: 1,
    base_fee: 15000,
    has_badge: false,
  },
  standard: {
    photo_limit: 8,
    slot_limit: 50,
    video_included: true,
    open_house_limit: 2,
    base_fee: 25000,
    has_badge: true,
  },
  premium: {
    photo_limit: 15,
    slot_limit: 100,
    video_included: true,
    open_house_limit: 5,
    base_fee: 50000,
    has_badge: true,
  },
} as const;
