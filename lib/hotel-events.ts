import { randomBytes } from "crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

const CITY_ALIASES: Record<string, string> = {
  ouaga: "ouagadougou",
  bobo: "bobo-dioulasso",
  po: "po",
  cinkasse: "cinkasse",
  dedougou: "dedougou",
  koupela: "koupela",
};

export function normalizeHotelEventCity(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return CITY_ALIASES[normalized] || normalized;
}

export function normalizeEventCode(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "-");
  return /^[A-Z0-9-]{4,24}$/.test(normalized) ? normalized : null;
}

export function eventCheckoutDate(eventEndDate: string) {
  const end = new Date(`${eventEndDate}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 10);
}

export function isBookingWithinEvent(
  startDate: string,
  endDate: string,
  eventStartDate: string,
  eventEndDate: string,
) {
  const checkoutDate = eventCheckoutDate(eventEndDate);
  return Boolean(
    checkoutDate && startDate >= eventStartDate && endDate <= checkoutDate,
  );
}

export function generateEventCode() {
  const bytes = randomBytes(5);
  let code = "";
  for (let index = 0; index < bytes.length; index += 1) {
    code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return `EV-${code}`;
}

export function generateHotelGroupCode() {
  const bytes = randomBytes(8);
  let code = "";
  for (let index = 0; index < bytes.length; index += 1) {
    code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return code;
}

export function parseEventBlock(input: Record<string, unknown>) {
  const countPledged = Number(input.countPledged);
  const rawRate = input.eventNightlyRate;
  const eventNightlyRate =
    rawRate == null || rawRate === "" ? null : Number(rawRate);
  if (
    !Number.isInteger(countPledged) ||
    countPledged < 1 ||
    countPledged > 500
  ) {
    return { error: "Invalid pledged room count" } as const;
  }
  if (
    eventNightlyRate != null &&
    (!Number.isInteger(eventNightlyRate) ||
      eventNightlyRate < 0 ||
      eventNightlyRate > 10_000_000)
  ) {
    return { error: "Invalid negotiated rate" } as const;
  }
  return {
    value: {
      count_pledged: countPledged,
      event_nightly_rate: eventNightlyRate,
    },
  } as const;
}

export function summarizeEventDashboard(
  blocks: Array<{ count_pledged?: number | null }>,
  bookings: Array<{
    status?: string | null;
    total_amount?: number | null;
    owner_net_amount?: number | null;
  }>,
) {
  const activeStatuses = new Set([
    "confirmed",
    "checked_in",
    "checkin_issue",
    "checkout_reported",
    "post_checkout_review",
    "issue_open",
    "completed",
  ]);
  const active = bookings.filter((booking) =>
    activeStatuses.has(String(booking.status)),
  );
  const roomsPledged = blocks.reduce(
    (sum, block) => sum + Math.max(0, Number(block.count_pledged) || 0),
    0,
  );
  return {
    roomsPledged,
    bookings: bookings.length,
    confirmedBookings: active.length,
    remainingRooms: Math.max(0, roomsPledged - active.length),
    grossPaid: active.reduce(
      (sum, booking) => sum + (Number(booking.total_amount) || 0),
      0,
    ),
    hotelNet: active.reduce(
      (sum, booking) => sum + (Number(booking.owner_net_amount) || 0),
      0,
    ),
  };
}
