import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESK_PAID_STATUSES, serializeDeskBooking } from "./hotel-desk.ts";

describe("hotel reception desk serialization", () => {
  for (const status of [
    "confirmed",
    "checked_in",
    "checkin_issue",
    "checkout_reported",
    "post_checkout_review",
    "issue_open",
    "completed",
  ]) {
    it(`treats ${status} as paid`, () => {
      assert.equal(DESK_PAID_STATUSES.has(status), true);
    });
  }

  it("returns the one-glance guest, room and payment fields", () => {
    const booking = serializeDeskBooking({
      id: "booking-1",
      status: "confirmed",
      booking_code: "RG-7XK2M9",
      start_date: "2026-09-01",
      end_date: "2026-09-03",
      nights: 2,
      guest_count: 2,
      nightly_rate: 25_000,
      stay_amount: 50_000,
      total_amount: 50_000,
      currency: "XOF",
      paid_at: "2026-08-29T12:00:00Z",
      property_id: "property-1",
      renter: { id: "guest-1", full_name: "Awa", phone: "70000000" },
      room_type: { id: "room-1", name: "Double", capacity: 2 },
      property: {
        id: "property-1",
        quartier: "Centre",
        city: "Bobo-Dioulasso",
        address: "Avenue 1",
      },
    });

    assert.equal(booking.id, "booking-1");
    assert.equal(booking.bookingCode, "RG-7XK2M9");
    assert.equal(booking.paid, true);
    assert.equal(booking.nights, 2);
    assert.deepEqual(booking.guest, {
      id: "guest-1",
      fullName: "Awa",
      phone: "70000000",
    });
    assert.deepEqual(booking.roomType, {
      id: "room-1",
      name: "Double",
      capacity: 2,
    });
    assert.equal(booking.property.city, "Bobo-Dioulasso");
  });

  it("does not report an unpaid request as paid", () => {
    assert.equal(
      serializeDeskBooking({ status: "requested", paid_at: null }).paid,
      false,
    );
  });
});
