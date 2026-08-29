export const HOTEL_REVENUE_STATUSES = new Set([
  "confirmed",
  "checked_in",
  "checkin_issue",
  "checkout_reported",
  "post_checkout_review",
  "issue_open",
  "completed",
]);

export type HotelOperationsBooking = {
  status?: string | null;
  start_date?: string | null;
  nights?: number | null;
  stay_amount?: number | null;
  owner_commission_amount?: number | null;
  owner_net_amount?: number | null;
};

export type HotelRoomCapacity = { total_count?: number | null };

export function summarizeHotelOperations(
  bookings: HotelOperationsBooking[],
  roomTypes: HotelRoomCapacity[],
  periodDays: number,
) {
  const days = Math.max(1, Math.round(periodDays));
  const totalRooms = roomTypes.reduce(
    (sum, room) => sum + Math.max(0, Number(room.total_count) || 0),
    0,
  );
  const paidBookings = bookings.filter((booking) =>
    HOTEL_REVENUE_STATUSES.has(String(booking.status)),
  );
  const bookedRoomNights = paidBookings.reduce(
    (sum, booking) => sum + Math.max(0, Number(booking.nights) || 0),
    0,
  );
  const availableRoomNights = totalRooms * days;
  const byDay = new Map<
    string,
    { date: string; bookings: number; grossRevenue: number; netRevenue: number }
  >();

  for (const booking of paidBookings) {
    const date = String(booking.start_date || "").slice(0, 10);
    if (!date) continue;
    const current = byDay.get(date) || {
      date,
      bookings: 0,
      grossRevenue: 0,
      netRevenue: 0,
    };
    current.bookings += 1;
    current.grossRevenue += Number(booking.stay_amount) || 0;
    current.netRevenue += Number(booking.owner_net_amount) || 0;
    byDay.set(date, current);
  }

  return {
    periodDays: days,
    totalRooms,
    totalBookings: bookings.length,
    pendingRequests: bookings.filter((booking) => booking.status === "requested")
      .length,
    paidBookings: paidBookings.length,
    activeStays: bookings.filter((booking) => booking.status === "checked_in")
      .length,
    completedStays: bookings.filter((booking) => booking.status === "completed")
      .length,
    grossRevenue: paidBookings.reduce(
      (sum, booking) => sum + (Number(booking.stay_amount) || 0),
      0,
    ),
    platformFees: paidBookings.reduce(
      (sum, booking) => sum + (Number(booking.owner_commission_amount) || 0),
      0,
    ),
    netRevenue: paidBookings.reduce(
      (sum, booking) => sum + (Number(booking.owner_net_amount) || 0),
      0,
    ),
    bookedRoomNights,
    availableRoomNights,
    occupancyRate:
      availableRoomNights > 0
        ? Math.min(1, bookedRoomNights / availableRoomNights)
        : 0,
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function normalizeHotelPayoutSettings(
  input: Record<string, unknown>,
):
  | { error: string }
  | {
      value: {
        payout_provider: "ORANGE_BFA" | "MOOV_BFA" | null;
        payout_phone: string | null;
      };
    } {
  const provider =
    input.payoutProvider === "ORANGE_BFA" || input.payoutProvider === "MOOV_BFA"
      ? input.payoutProvider
      : null;
  const digits =
    typeof input.payoutPhone === "string"
      ? input.payoutPhone.replace(/\D/g, "").replace(/^226/, "")
      : "";

  if (input.payoutProvider != null && !provider) {
    return { error: "Invalid payout provider" };
  }
  if (digits && digits.length !== 8) {
    return { error: "Payout phone must contain 8 digits" };
  }

  return {
    value: {
      payout_provider: provider,
      payout_phone: digits || null,
    },
  };
}
