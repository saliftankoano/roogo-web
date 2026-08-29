import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateEventCode,
  generateHotelGroupCode,
  normalizeEventCode,
  parseEventBlock,
  summarizeEventDashboard,
} from "./hotel-events.ts";

describe("hotel event codes", () => {
  it("normalizes codes and rejects unsafe input", () => {
    assert.equal(normalizeEventCode("  ev ouaga 26 "), "EV-OUAGA-26");
    assert.equal(normalizeEventCode("a"), null);
    assert.equal(normalizeEventCode("event/code"), null);
  });

  it("generates unambiguous event and group codes", () => {
    assert.match(
      generateEventCode(),
      /^EV-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/,
    );
    assert.match(
      generateHotelGroupCode(),
      /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/,
    );
  });
});

describe("hotel event room blocks", () => {
  it("accepts pledged inventory with an optional negotiated rate", () => {
    assert.deepEqual(
      parseEventBlock({ countPledged: 12, eventNightlyRate: 35_000 }),
      {
        value: { count_pledged: 12, event_nightly_rate: 35_000 },
      },
    );
    assert.deepEqual(
      parseEventBlock({ countPledged: 3, eventNightlyRate: "" }),
      {
        value: { count_pledged: 3, event_nightly_rate: null },
      },
    );
  });

  it("rejects invalid inventory and negotiated rates", () => {
    assert.equal(
      parseEventBlock({ countPledged: 0 }).error,
      "Invalid pledged room count",
    );
    assert.equal(
      parseEventBlock({ countPledged: 2, eventNightlyRate: -1 }).error,
      "Invalid negotiated rate",
    );
  });
});

describe("hotel event dashboard", () => {
  it("summarizes pledged capacity and paid amounts", () => {
    assert.deepEqual(
      summarizeEventDashboard(
        [{ count_pledged: 8 }, { count_pledged: 4 }],
        [
          {
            status: "confirmed",
            total_amount: 50_000,
            owner_net_amount: 46_500,
          },
          {
            status: "completed",
            total_amount: 40_000,
            owner_net_amount: 37_200,
          },
          {
            status: "requested",
            total_amount: 30_000,
            owner_net_amount: 27_900,
          },
        ],
      ),
      {
        roomsPledged: 12,
        bookings: 3,
        confirmedBookings: 2,
        remainingRooms: 10,
        grossPaid: 90_000,
        hotelNet: 83_700,
      },
    );
  });
});
