import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canPayRentScheduleThroughRoogo,
  firstUnpaidRentScheduleId,
} from "./rent-collection.ts";

describe("default-on rent collection", () => {
  it("allows every unpaid schedule while collection is enabled", () => {
    assert.equal(
      canPayRentScheduleThroughRoogo({
        rentCollectionEnabled: true,
        hasPendingSuccessFee: false,
        scheduleId: "schedule-2",
        firstUnpaidScheduleId: "schedule-1",
      }),
      true,
    );
  });

  it("blocks later schedules after the owner opts out", () => {
    assert.equal(
      canPayRentScheduleThroughRoogo({
        rentCollectionEnabled: false,
        hasPendingSuccessFee: false,
        scheduleId: "schedule-2",
        firstUnpaidScheduleId: "schedule-1",
      }),
      false,
    );
  });

  it("keeps only the first unpaid schedule available when the success fee is pending", () => {
    const input = {
      rentCollectionEnabled: false,
      hasPendingSuccessFee: true,
      firstUnpaidScheduleId: "schedule-1",
    };

    assert.equal(
      canPayRentScheduleThroughRoogo({ ...input, scheduleId: "schedule-1" }),
      true,
    );
    assert.equal(
      canPayRentScheduleThroughRoogo({ ...input, scheduleId: "schedule-2" }),
      false,
    );
  });

  it("selects the earliest unpaid schedule deterministically", () => {
    assert.equal(
      firstUnpaidRentScheduleId([
        { id: "paid", due_date: "2026-08-01", status: "paid" },
        { id: "later", due_date: "2026-10-01", status: "upcoming" },
        { id: "first", due_date: "2026-09-01", status: "overdue" },
      ]),
      "first",
    );
  });
});
