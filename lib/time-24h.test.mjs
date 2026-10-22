import test from "node:test";
import assert from "node:assert/strict";
import { joinTime, splitTime, timeOptions } from "./time-24h.ts";

test("splitTime reads HH:MM and HH:MM:SS, rejects the rest", () => {
  assert.deepEqual(splitTime("18:00"), { hour: "18", minute: "00" });
  assert.deepEqual(splitTime("09:45:00"), { hour: "09", minute: "45" });
  assert.deepEqual(splitTime(""), { hour: "", minute: "" });
  assert.deepEqual(splitTime(null), { hour: "", minute: "" });
  assert.deepEqual(splitTime("12:30 PM"), { hour: "", minute: "" });
  assert.deepEqual(splitTime("25:00"), { hour: "", minute: "" });
});

test("joinTime keeps the API format and clears without an hour", () => {
  assert.equal(joinTime("12", "30"), "12:30");
  assert.equal(joinTime("07", ""), "07:00");
  assert.equal(joinTime("", "30"), "");
});

test("timeOptions covers 07 to 21 by quarter hours", () => {
  const { hours, minutes } = timeOptions("");
  assert.equal(hours[0], "07");
  assert.equal(hours.at(-1), "21");
  assert.equal(hours.length, 15);
  assert.deepEqual(minutes, ["00", "15", "30", "45"]);
});

test("timeOptions keeps an existing value outside the range or step", () => {
  const { hours, minutes } = timeOptions("22:05");
  assert.ok(hours.includes("22"));
  assert.ok(minutes.includes("05"));
  assert.deepEqual(minutes, ["00", "05", "15", "30", "45"]);
});
