export const DESK_VISIBLE_STATUSES = [
  "requested",
  "approved_awaiting_payment",
  "payment_pending",
  "confirmed",
  "checked_in",
  "checkin_issue",
  "checkout_reported",
  "post_checkout_review",
  "issue_open",
  "completed",
];

export const DESK_PAID_STATUSES = new Set([
  "confirmed",
  "checked_in",
  "checkin_issue",
  "checkout_reported",
  "post_checkout_review",
  "issue_open",
  "completed",
]);

export const DESK_BOOKING_SELECT =
  "*, renter:renter_id(id, full_name, phone), room_type:room_type_id(id, name, capacity), property:property_id(id, quartier, city, address, hotel_id)";

export function serializeDeskBooking(row: Record<string, unknown>) {
  const renter = (row.renter ?? null) as Record<string, unknown> | null;
  const roomType = (row.room_type ?? null) as Record<string, unknown> | null;
  const property = (row.property ?? null) as Record<string, unknown> | null;
  return {
    id: row.id,
    status: row.status,
    bookingCode: row.booking_code ?? null,
    startDate: row.start_date,
    endDate: row.end_date,
    nights: row.nights,
    guestCount: row.guest_count,
    nightlyRate: row.nightly_rate,
    stayAmount: row.stay_amount,
    totalAmount: row.total_amount,
    currency: row.currency,
    paid: DESK_PAID_STATUSES.has(String(row.status)) || !!row.paid_at,
    paidAt: row.paid_at ?? null,
    propertyId: row.property_id,
    property: property
      ? {
          id: property.id,
          quartier: property.quartier ?? null,
          city: property.city ?? null,
          address: property.address ?? null,
        }
      : null,
    roomType: roomType
      ? { id: roomType.id, name: roomType.name, capacity: roomType.capacity }
      : null,
    guest: renter
      ? {
          id: renter.id,
          fullName: renter.full_name ?? null,
          phone: renter.phone ?? null,
        }
      : null,
    checkinConfirmedAt: row.checkin_confirmed_at ?? null,
    checkoutReportedAt: row.checkout_reported_at ?? null,
  };
}
