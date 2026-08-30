import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeHotelPayoutSettings,
  summarizeHotelOperations,
} from "./hotel-operations.ts";

describe("hotel operations", () => {
  it("summarizes paid revenue, fees, occupancy and workflow counts", () => {
    const summary = summarizeHotelOperations(
      [
        {
          status: "confirmed",
          start_date: "2026-08-01",
          nights: 2,
          stay_amount: 50_000,
          owner_commission_amount: 3_500,
          owner_net_amount: 46_500,
        },
        {
          status: "completed",
          start_date: "2026-08-02",
          nights: 3,
          stay_amount: 60_000,
          owner_commission_amount: 4_200,
          owner_net_amount: 55_800,
        },
        { status: "requested", start_date: "2026-08-03", nights: 1 },
      ],
      [{ total_count: 10 }, { total_count: 5 }],
      30,
    );

    assert.equal(summary.totalRooms, 15);
    assert.equal(summary.totalBookings, 3);
    assert.equal(summary.pendingRequests, 1);
    assert.equal(summary.paidBookings, 2);
    assert.equal(summary.completedStays, 1);
    assert.equal(summary.grossRevenue, 110_000);
    assert.equal(summary.platformFees, 7_700);
    assert.equal(summary.netRevenue, 102_300);
    assert.equal(summary.bookedRoomNights, 5);
    assert.equal(summary.availableRoomNights, 450);
    assert.equal(summary.occupancyRate, 5 / 450);
    assert.equal(summary.byDay.length, 2);
  });

  it("does not count requested or failed payments as revenue", () => {
    const summary = summarizeHotelOperations(
      [
        { status: "requested", stay_amount: 25_000 },
        { status: "payment_expired", stay_amount: 25_000 },
      ],
      [],
      7,
    );
    assert.equal(summary.grossRevenue, 0);
    assert.equal(summary.occupancyRate, 0);
  });

  it("normalizes Burkina payout settings", () => {
    assert.deepEqual(
      normalizeHotelPayoutSettings({
        payoutProvider: "ORANGE_BFA",
        payoutPhone: "+226 70 00 00 00",
      }),
      {
        value: {
          payout_provider: "ORANGE_BFA",
          payout_phone: "70000000",
        },
      },
    );
  });

  it("rejects invalid payout settings", () => {
    assert.equal(
      normalizeHotelPayoutSettings({ payoutProvider: "CARD" }).error,
      "Invalid payout provider",
    );
    assert.equal(
      normalizeHotelPayoutSettings({ payoutPhone: "123" }).error,
      "Payout phone must contain 8 digits",
    );
    assert.equal(
      normalizeHotelPayoutSettings({}).error,
      "No valid fields to update",
    );
  });

  it("preserves omitted payout settings during partial updates", () => {
    assert.deepEqual(
      normalizeHotelPayoutSettings({ payoutPhone: "70112233" }),
      {
        value: { payout_phone: "70112233" },
      },
    );
    assert.deepEqual(
      normalizeHotelPayoutSettings({ payoutProvider: "MOOV_BFA" }),
      {
        value: { payout_provider: "MOOV_BFA" },
      },
    );
  });
});
