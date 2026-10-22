import test from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_DAYS,
  REPLY_SLA_MS,
  addBusinessMs,
  businessDurationLabel,
  businessHoursBetween,
  businessMsBetween,
  compareSla,
  replyDueAt,
  responseSummary,
  shortWeekdayTime,
  slaLabel,
  slaState,
  weekStart,
} from "./sla.ts";
import { waitingBadgeLabel, waitingSentence } from "./inbox.ts";

// Week of 2026-10-19: Mon 19, Tue 20, Wed 21, Thu 22, Fri 23, Sat 24, Sun 25, Mon 26.
const H = 60 * 60 * 1000;
const due = (iso) => replyDueAt(iso).toISOString();

test("working days are Monday to Friday, in one constant", () => {
  assert.deepEqual([...BUSINESS_DAYS], [1, 2, 3, 4, 5]);
  assert.equal(REPLY_SLA_MS, 24 * H);
});

test("Salif's examples (2026-10-21)", () => {
  // Tuesday 10:00 -> Wednesday 10:00
  assert.equal(due("2026-10-20T10:00:00Z"), "2026-10-21T10:00:00.000Z");
  // Friday 18:00 -> Monday 18:00
  assert.equal(due("2026-10-23T18:00:00Z"), "2026-10-26T18:00:00.000Z");
  // Saturday 15:00 -> Tuesday 00:00 (the clock starts Monday 00:00)
  assert.equal(due("2026-10-24T15:00:00Z"), "2026-10-27T00:00:00.000Z");
});

test("weekend crossings and items received on the weekend", () => {
  // Thursday 23:30 -> Friday 23:30 (no crossing)
  assert.equal(due("2026-10-22T23:30:00Z"), "2026-10-23T23:30:00.000Z");
  // Friday 00:01 -> Monday 00:01
  assert.equal(due("2026-10-23T00:01:00Z"), "2026-10-26T00:01:00.000Z");
  // Friday 23:59 -> Monday 23:59
  assert.equal(due("2026-10-23T23:59:00Z"), "2026-10-26T23:59:00.000Z");
  // Saturday 00:00 and Sunday 23:59 -> Tuesday 00:00
  assert.equal(due("2026-10-24T00:00:00Z"), "2026-10-27T00:00:00.000Z");
  assert.equal(due("2026-10-25T23:59:59Z"), "2026-10-27T00:00:00.000Z");
  // Monday 00:00 -> Tuesday 00:00
  assert.equal(due("2026-10-26T00:00:00Z"), "2026-10-27T00:00:00.000Z");
  // 60 business hours from Thursday 12:00 -> Tuesday 00:00 (12 + 24 Fri + skip weekend + 24 Mon)
  assert.equal(addBusinessMs("2026-10-22T12:00:00Z", 60 * H).toISOString(), "2026-10-27T00:00:00.000Z");
});

test("exact boundaries", () => {
  // A deadline that lands at the end of a working day stays at that midnight (Friday 24:00).
  assert.equal(due("2026-10-23T00:00:00Z"), "2026-10-24T00:00:00.000Z");
  // Zero business time from Saturday starts on Monday 00:00.
  assert.equal(addBusinessMs("2026-10-24T10:00:00Z", 0).toISOString(), "2026-10-26T00:00:00.000Z");
  const item = { kind: "comment", status: "a_repondre", at: "2026-10-20T10:00:00Z" };
  // At the deadline itself: still on time, nothing left.
  assert.deepEqual(slaState(item, new Date("2026-10-21T10:00:00Z")), {
    startAt: "2026-10-20T10:00:00.000Z",
    dueAt: "2026-10-21T10:00:00.000Z",
    overdue: false,
    remainingMs: 0,
  });
  // One millisecond later: late.
  const late = slaState(item, new Date("2026-10-21T10:00:00.001Z"));
  assert.equal(late.overdue, true);
  assert.equal(late.lateMs, 1);
});

test("Ouagadougou time is UTC: offsets in the input are honoured, labels in UTC", () => {
  // 2026-10-20 12:00 in Paris (UTC+2) is 10:00 in Ouagadougou.
  assert.equal(due("2026-10-20T12:00:00+02:00"), "2026-10-21T10:00:00.000Z");
  // Friday 23:30 in New York (UTC-4) is already Saturday 03:30 in Ouagadougou -> Tuesday 00:00.
  assert.equal(due("2026-10-23T23:30:00-04:00"), "2026-10-27T00:00:00.000Z");
  assert.equal(shortWeekdayTime("2026-10-26T18:00:00Z"), "lun. 18:00");
  assert.equal(shortWeekdayTime("2026-10-24T00:00:00Z"), "sam. 00:00");
});

test("business hours between two instants", () => {
  assert.equal(businessHoursBetween("2026-10-20T10:00:00Z", "2026-10-21T10:00:00Z"), 24);
  // Friday 18:00 -> Monday 18:00: 6 + 18
  assert.equal(businessHoursBetween("2026-10-23T18:00:00Z", "2026-10-26T18:00:00Z"), 24);
  // Inside the weekend: nothing
  assert.equal(businessHoursBetween("2026-10-24T08:00:00Z", "2026-10-25T20:00:00Z"), 0);
  // Reversed or equal: 0
  assert.equal(businessMsBetween("2026-10-21T10:00:00Z", "2026-10-20T10:00:00Z"), 0);
  // Two full weeks and a bit: 10 working days + Monday 0-6h
  assert.equal(businessHoursBetween("2026-10-19T00:00:00Z", "2026-11-02T06:00:00Z"), 10 * 24 + 6);
  // Matches the deadline: always 24 business hours from start to due
  for (const start of ["2026-10-19T07:13:00Z", "2026-10-23T22:00:00Z", "2026-10-25T09:00:00Z", "2026-10-22T00:00:00Z"]) {
    const s = new Date(start);
    const effective = s.getUTCDay() === 0 || s.getUTCDay() === 6 ? "2026-10-26T00:00:00Z" : start;
    assert.equal(businessHoursBetween(effective, replyDueAt(start)), 24, start);
  }
});

test("Saturday can be added in one line", () => {
  const withSaturday = [1, 2, 3, 4, 5, 6];
  assert.equal(replyDueAt("2026-10-23T18:00:00Z", withSaturday).toISOString(), "2026-10-24T18:00:00.000Z");
  assert.equal(replyDueAt("2026-10-24T15:00:00Z", withSaturday).toISOString(), "2026-10-26T15:00:00.000Z");
});

test("slaState: only « À répondre », messages from the person's last message", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  assert.equal(slaState({ kind: "comment", status: "repondu", at: "2026-10-01T10:00:00Z" }, now), null);
  assert.equal(slaState({ kind: "comment", status: "ignore", at: "2026-10-01T10:00:00Z" }, now), null);
  const msg = slaState({ kind: "message", status: "a_repondre", at: "2026-10-21T11:00:00Z", lastUserMessageAt: "2026-10-20T09:00:00Z" }, now);
  assert.equal(msg.dueAt, "2026-10-21T09:00:00.000Z");
  assert.equal(msg.overdue, true);
  assert.equal(msg.lateMs, 3 * H);
  assert.equal(slaLabel(msg), "En retard de 3 h");
  const onTime = slaState({ kind: "comment", status: "a_repondre", at: "2026-10-23T18:00:00Z" }, new Date("2026-10-24T12:00:00Z"));
  assert.equal(onTime.overdue, false);
  assert.equal(onTime.remainingMs, 18 * H); // paused over the weekend
  assert.equal(slaLabel(onTime), "À répondre avant lun. 18:00");
});

test("late label counts business time, the weekend does not add to it", () => {
  // Due Friday 20:00, seen Sunday noon: 4 h late, not 40 h.
  const item = { kind: "comment", status: "a_repondre", at: "2026-10-22T20:00:00Z" };
  assert.equal(slaLabel(slaState(item, new Date("2026-10-25T12:00:00Z"))), "En retard de 4 h");
  // Due Tuesday 10:00, seen Thursday 11:00: 49 business hours -> 2 j.
  assert.equal(slaLabel(slaState({ kind: "comment", status: "a_repondre", at: "2026-10-19T10:00:00Z" }, new Date("2026-10-22T11:00:00Z"))), "En retard de 2 j");
  assert.equal(slaLabel(slaState({ kind: "comment", status: "a_repondre", at: "2026-10-19T10:00:00Z" }, new Date("2026-10-20T10:20:00Z"))), "En retard de 20 min");
});

test("sorting: overdue first (most late first), then the nearest deadline, then no deadline", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const items = [
    { id: "replied", kind: "comment", status: "repondu", at: "2026-10-22T11:00:00Z" },
    { id: "soon", kind: "comment", status: "a_repondre", at: "2026-10-21T13:00:00Z" },
    { id: "late1h", kind: "comment", status: "a_repondre", at: "2026-10-21T11:00:00Z" },
    { id: "later", kind: "comment", status: "a_repondre", at: "2026-10-22T09:00:00Z" },
    { id: "late1d", kind: "comment", status: "a_repondre", at: "2026-10-20T11:00:00Z" },
  ];
  const sorted = [...items].sort((a, b) => compareSla(slaState(a, now), slaState(b, now))).map((i) => i.id);
  assert.deepEqual(sorted, ["late1d", "late1h", "soon", "later", "replied"]);
});

test("labels and week start", () => {
  assert.equal(businessDurationLabel(45 * 60 * 1000), "45 min");
  assert.equal(businessDurationLabel(3 * H + 20 * 60 * 1000), "3 h 20");
  assert.equal(businessDurationLabel(26 * H), "1 j 2 h");
  assert.equal(weekStart(new Date("2026-10-21T12:00:00Z")).toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(weekStart(new Date("2026-10-25T23:00:00Z")).toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(weekStart(new Date("2026-10-26T00:00:00Z")).toISOString(), "2026-10-26T00:00:00.000Z");
});

test("response summary for the week, in business hours", () => {
  const now = new Date("2026-10-23T16:00:00Z"); // Friday
  const base = { status: "repondu", repliedExternally: false, statusChangedAt: null, lastUserMessageAt: null };
  const rows = [
    // Awa: 2 h, 30 h (late), comment from last Friday answered Monday 10:00 = 10 h
    { ...base, kind: "comment", at: "2026-10-20T08:00:00Z", repliedAt: "2026-10-20T10:00:00Z", repliedById: "u1", repliedByName: "Awa" },
    { ...base, kind: "message", at: "2026-10-22T20:00:00Z", lastUserMessageAt: "2026-10-21T08:00:00Z", repliedAt: "2026-10-22T14:00:00Z", repliedById: "u1", repliedByName: "Awa" },
    { ...base, kind: "comment", at: "2026-10-16T22:00:00Z", repliedAt: "2026-10-19T08:00:00Z", repliedById: "u1", repliedByName: "Awa" },
    // Moubarak: 1 h
    { ...base, kind: "comment", at: "2026-10-23T09:00:00Z", repliedAt: "2026-10-23T10:00:00Z", repliedById: "u2", repliedByName: "Moubarak" },
    // Last week's reply: not counted
    { ...base, kind: "comment", at: "2026-10-15T09:00:00Z", repliedAt: "2026-10-15T10:00:00Z", repliedById: "u2", repliedByName: "Moubarak" },
    // Answered in the Meta apps this week: counted apart
    { ...base, kind: "comment", at: "2026-10-20T09:00:00Z", repliedAt: null, repliedById: null, repliedByName: null, repliedExternally: true, statusChangedAt: "2026-10-20T09:10:00Z" },
    // The person wrote again after the reply: this round is not answered, skipped
    { ...base, kind: "message", at: "2026-10-22T09:00:00Z", lastUserMessageAt: "2026-10-22T09:00:00Z", repliedAt: "2026-10-21T09:00:00Z", repliedById: "u2", repliedByName: "Moubarak" },
    // Ignored: not a reply
    { ...base, status: "ignore", kind: "comment", at: "2026-10-20T09:00:00Z", repliedAt: "2026-10-20T10:00:00Z", repliedById: "u2", repliedByName: "Moubarak" },
  ];
  const s = responseSummary(rows, now);
  assert.equal(s.weekStart, "2026-10-19T00:00:00.000Z");
  assert.equal(s.measured, 4);
  assert.equal(s.onTime, 3);
  assert.equal(s.onTimePct, 75);
  assert.equal(s.external, 1);
  assert.deepEqual(
    s.staff.map((x) => [x.name, x.replies, x.medianMs / H, x.maxMs / H, x.late]),
    [
      ["Awa", 3, 10, 30, 1],
      ["Moubarak", 1, 1, 1, 0],
    ],
  );
  assert.equal(responseSummary([], now).onTimePct, null);
});

test("waiting sentence and badge label with the overdue part", () => {
  assert.equal(waitingSentence({ comments: 3, messages: 2, total: 5, overdue: 2 }), "3 commentaires et 2 messages attendent une réponse, dont 2 en retard");
  assert.equal(
    waitingSentence({ comments: 3, messages: 2, total: 5, overdue: 2 }, "sur Facebook et Instagram"),
    "3 commentaires et 2 messages attendent une réponse sur Facebook et Instagram, dont 2 en retard",
  );
  assert.equal(waitingSentence({ comments: 1, messages: 0, total: 1, overdue: 0 }), "1 commentaire attend une réponse");
  assert.equal(waitingBadgeLabel(5, 2), "5 à répondre, dont 2 en retard");
  assert.equal(waitingBadgeLabel(5, 0), "5 à répondre");
});
