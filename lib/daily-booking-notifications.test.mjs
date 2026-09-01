import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDailyBookingApprovalNotification } from "./daily-booking-notifications.ts";
import { renderNotificationCopy } from "./notification-copy.ts";

describe("daily booking approval notifications", () => {
  it("uses hotel-specific copy and exact routing identifiers", () => {
    const notification = buildDailyBookingApprovalNotification({
      isHotelBooking: true,
      requestId: "request-hotel-1",
      propertyId: "property-hotel-1",
    });

    assert.equal(
      notification.copyKey,
      "dailyBookings.requestApprovedRenterHotel",
    );
    assert.deepEqual(notification.data, {
      type: "daily_booking_request_approved",
      dailyBookingRequestId: "request-hotel-1",
      propertyId: "property-hotel-1",
    });

    assert.deepEqual(
      renderNotificationCopy(notification.copyKey, "fr", {
        propertyLabel: "Roogo QA Hotel",
        deadline: "01/09/2026 18:00",
      }),
      {
        title: "Disponibilité confirmée",
        body: "L'hôtel a confirmé votre chambre à Roogo QA Hotel. Payez avant 01/09/2026 18:00 pour confirmer la réservation.",
      },
    );
  });

  it("renders equivalent hotel copy in English", () => {
    assert.deepEqual(
      renderNotificationCopy("dailyBookings.requestApprovedRenterHotel", "en", {
        propertyLabel: "Roogo QA Hotel",
        deadline: "09/01/2026 6:00 PM",
      }),
      {
        title: "Availability confirmed",
        body: "The hotel confirmed your room at Roogo QA Hotel. Pay by 09/01/2026 6:00 PM to confirm the booking.",
      },
    );
  });

  it("preserves the existing copy for ordinary daily rentals", () => {
    const notification = buildDailyBookingApprovalNotification({
      isHotelBooking: false,
      requestId: "request-rental-1",
      propertyId: "property-rental-1",
    });

    assert.equal(notification.copyKey, "dailyBookings.requestApprovedRenter");
    assert.deepEqual(notification.data, {
      type: "daily_booking_request_approved",
      dailyBookingRequestId: "request-rental-1",
      propertyId: "property-rental-1",
    });
  });
});
