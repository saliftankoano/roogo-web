import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignmentKind,
  briefingSentence,
  buildBriefing,
  buildColumn,
  bundlePastWeeks,
  dayKey,
  demandeState,
  isDirectorOrFounder,
  isLate,
  levelFor,
  mergeItems,
  orderPeople,
  parseNewTask,
  rangeLabel,
  rowToItem,
  weekBounds,
  weekLabel,
  whenLabel,
  askDueLabel,
} from "./core.ts";

const at = (iso) => new Date(iso);

function item(overrides = {}) {
  return {
    key: overrides.key ?? `task:${Math.random()}`,
    origin: "manuel",
    taskId: null,
    sourceKey: null,
    kindLabel: "Tâche",
    tone: "grey",
    title: "Tâche",
    sub: "",
    ownerId: "u1",
    fromId: null,
    fromName: null,
    dueDate: "2026-10-14",
    dueTime: null,
    timeMode: "day",
    status: "a_faire",
    completedAt: null,
    href: null,
    actionLabel: "Commencer",
    canCheck: true,
    note: null,
    propertyId: null,
    visitRequestId: null,
    studioProjectId: null,
    ...overrides,
  };
}

describe("week bounds (Ouagadougou = UTC)", () => {
  it("runs Monday to Saturday", () => {
    const week = weekBounds("2026-10-14");
    assert.equal(week.startKey, "2026-10-12");
    assert.equal(week.endKey, "2026-10-17");
    assert.equal(week.days.length, 6);
    assert.equal(week.endExclusive.toISOString(), "2026-10-18T00:00:00.000Z");
  });

  it("puts Sunday in the week that starts the next morning", () => {
    assert.equal(weekBounds("2026-10-18").startKey, "2026-10-19");
  });

  it("keeps Saturday 23:59 in the week and Sunday 00:00 out of it", () => {
    assert.equal(weekBounds(dayKey(at("2026-10-17T23:59:00Z"))).startKey, "2026-10-12");
    assert.equal(weekBounds(dayKey(at("2026-10-18T00:00:00Z"))).startKey, "2026-10-19");
  });

  it("labels weeks in French across months and years", () => {
    assert.equal(weekLabel("2026-10-07"), "Semaine du 5 au 10 octobre");
    assert.equal(rangeLabel("2026-09-28", "2026-10-03"), "du 28 septembre au 3 octobre");
    assert.equal(rangeLabel("2025-12-29", "2026-01-03"), "du 29 décembre 2025 au 3 janvier 2026");
  });
});

describe("levels and who may give tasks", () => {
  const founder = { id: "f", level: "fondateur" };
  const director = { id: "d", level: "directeur" };
  const adviser = { id: "c", level: "conseillere" };
  const assistant = { id: "a", level: "assistant" };

  it("derives the founder from Clerk and the rest from the title, default Conseillère", () => {
    assert.equal(levelFor("founder", "stagiaire"), "fondateur");
    assert.equal(levelFor("staff", "directeur"), "directeur");
    assert.equal(levelFor("staff", null), "conseillere");
    assert.equal(levelFor("staff", "bogus"), "conseillere");
    assert.equal(isDirectorOrFounder("directeur"), true);
    assert.equal(isDirectorOrFounder("assistant"), false);
  });

  it("lets everyone add a task for themselves", () => {
    for (const actor of [founder, director, adviser]) assert.equal(assignmentKind(actor, actor), "manuel");
  });

  it("lets Directeur and Fondateur give tasks to staff", () => {
    assert.equal(assignmentKind(director, adviser), "manuel");
    assert.equal(assignmentKind(founder, assistant), "manuel");
    assert.equal(assignmentKind(founder, director), "manuel");
  });

  it("only lets a Directeur reach the founder, and only as a demande", () => {
    assert.equal(assignmentKind(director, founder), "demande");
    assert.equal(assignmentKind(adviser, founder), null);
    assert.equal(assignmentKind(assistant, founder), null);
  });

  it("does not let other staff give tasks to each other", () => {
    assert.equal(assignmentKind(adviser, assistant), null);
    assert.equal(assignmentKind(assistant, director), null);
  });
});

describe("late and when labels", () => {
  const now = at("2026-10-14T11:00:00Z");

  it("is late when the time has passed or the day is over", () => {
    assert.equal(isLate(item({ dueTime: "10:00", timeMode: "at" }), now), true);
    assert.equal(isLate(item({ dueTime: "12:00", timeMode: "before" }), now), false);
    assert.equal(isLate(item({ dueDate: "2026-10-13" }), now), true);
    assert.equal(isLate(item({}), now), false);
    assert.equal(isLate(item({ dueDate: "2026-10-13", status: "fait", completedAt: "2026-10-13T10:00:00Z" }), now), false);
  });

  it("speaks like the canvas", () => {
    assert.equal(whenLabel(item({ dueTime: "18:00", timeMode: "before" }), now), "Avant 18:00");
    assert.equal(whenLabel(item({ dueTime: "16:00", timeMode: "at", dueDate: "2026-10-13" }), now), "Hier 16:00");
    assert.equal(whenLabel(item({ dueTime: "10:00", timeMode: "at", dueDate: "2026-10-16" }), now), "Ven 16 10:00");
    assert.equal(whenLabel(item({ dueDate: "2026-10-07" }), now), "Reportée · mer 7");
    assert.equal(whenLabel(item({ status: "reportee" }), now), "Aujourd’hui · reportée");
  });

  it("labels the due day of an ask", () => {
    assert.equal(askDueLabel("2026-10-16", now), "Pour vendredi");
    assert.equal(askDueLabel("2026-10-15", now), "Pour demain");
    assert.equal(askDueLabel("2026-10-21", now), "Pour le 21 octobre");
  });
});

describe("briefing", () => {
  const now = at("2026-10-14T09:00:00Z");
  const items = [
    item({ key: "late", title: "Rappeler le client", dueDate: "2026-10-13", dueTime: "16:00", timeMode: "at" }),
    item({ key: "visit", title: "Visite, Tanghin", dueTime: "10:00", timeMode: "at" }),
    item({ key: "flyers", title: "Préparer 20 flyers", dueTime: "18:00", timeMode: "before" }),
    item({ key: "done", title: "Scanner", status: "fait", completedAt: "2026-10-14T08:00:00Z" }),
    item({ key: "tomorrow", title: "Demain", dueDate: "2026-10-15" }),
  ];

  it("splits late, now, later and tomorrow, and counts the day", () => {
    const parts = buildBriefing(items, now);
    assert.deepEqual(parts.late.map((i) => i.key), ["late"]);
    assert.equal(parts.next?.key, "visit");
    assert.deepEqual(parts.rest.map((i) => i.key).sort(), ["done", "flyers"]);
    assert.deepEqual(parts.tomorrow.map((i) => i.key), ["tomorrow"]);
    assert.equal(parts.total, 4);
    assert.equal(parts.done, 1);
    assert.equal(parts.open, 3);
    assert.equal(parts.week.length, 6);
    assert.equal(parts.week.find((d) => d.isToday).total, 3);
    assert.equal(parts.week.find((d) => d.key === "2026-10-13").total, 1);
  });

  it("writes one plain sentence", () => {
    const parts = buildBriefing(items, now);
    assert.equal(
      briefingSentence(parts),
      "3 tâches aujourd’hui, dont 1 en retard. Commencez par la tâche en retard, puis visite, Tanghin à 10:00.",
    );
    assert.equal(briefingSentence({ late: [], next: null, total: 2, open: 0 }), "Tout est fait pour aujourd’hui. Bravo, et merci.");
    assert.doesNotMatch(briefingSentence(parts), /—/);
  });

  it("keeps a late task done today in today's count", () => {
    const doneLate = items.map((i) =>
      i.key === "late" ? { ...i, status: "fait", completedAt: "2026-10-14T08:30:00Z" } : i,
    );
    const parts = buildBriefing(doneLate, now);
    assert.equal(parts.late.length, 0);
    assert.equal(parts.total, 4);
    assert.equal(parts.done, 2);
  });

  it("skips Sunday for tomorrow", () => {
    const parts = buildBriefing([item({ key: "mon", dueDate: "2026-10-19" })], at("2026-10-17T10:00:00Z"));
    assert.equal(parts.tomorrowKey, "2026-10-19");
    assert.equal(parts.tomorrow.length, 1);
  });
});

describe("stored tasks and automatic items", () => {
  const names = new Map([["d", { firstName: "Ablassé" }], ["f", { firstName: "Salif" }]]);
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    owner_id: "c", created_by: "d", kind: "manuel", title: "Flyers", note: "Modèle", due_date: "2026-10-14",
    due_time: "18:00:00", status: "a_faire", completed_at: null, completed_by: null, property_id: null,
    visit_request_id: null, studio_project_id: null, source_key: null, source_href: null, reason: null,
    reply_text: null, replied_at: null, accepted_at: null, created_at: "", updated_at: "",
  };

  it("shows who gave a task and keeps 'avant HH:MM'", () => {
    const value = rowToItem(row, names);
    assert.equal(value.fromName, "Ablassé");
    assert.equal(value.dueTime, "18:00");
    assert.equal(value.timeMode, "before");
  });

  it("does not turn a pending or answered demande into a task", () => {
    assert.equal(rowToItem({ ...row, kind: "demande", owner_id: "f", reason: "x" }, names), null);
    assert.equal(rowToItem({ ...row, kind: "demande", owner_id: "f", reason: "x", replied_at: "t", reply_text: "Non" }, names), null);
    assert.equal(rowToItem({ ...row, kind: "demande", owner_id: "f", reason: "x", accepted_at: "t" }, names).origin, "demande");
  });

  it("reads the state of a demande", () => {
    assert.equal(demandeState({ status: "a_faire", accepted_at: null, replied_at: null }), "pending");
    assert.equal(demandeState({ status: "a_faire", accepted_at: null, replied_at: "t" }), "replied");
    assert.equal(demandeState({ status: "a_faire", accepted_at: "t", replied_at: null }), "accepted");
    assert.equal(demandeState({ status: "fait", accepted_at: "t", replied_at: null }), "done");
  });

  it("hides an automatic item once a stored task carries its key", () => {
    const stored = [item({ key: "task:1", sourceKey: "visit:1" })];
    const auto = [item({ key: "visit:1", sourceKey: "visit:1", origin: "auto" }), item({ key: "visit:2", sourceKey: "visit:2", origin: "auto" })];
    assert.deepEqual(mergeItems(stored, auto).map((i) => i.key), ["task:1", "visit:2"]);
  });
});

describe("team board", () => {
  const now = at("2026-10-14T11:00:00Z");
  const people = [
    { id: "c", firstName: "Rokiatou", level: "conseillere" },
    { id: "f", firstName: "Salif", level: "fondateur" },
    { id: "d", firstName: "Ablassé", level: "directeur" },
    { id: "a", firstName: "Moubarak", level: "assistant" },
  ];

  it("orders the founder first, then the Directeur", () => {
    assert.deepEqual(orderPeople(people).map((p) => p.id), ["f", "d", "a", "c"]);
  });

  it("counts today and the week, marks late and current, groups done by day, recent first", () => {
    const person = { id: "c", fullName: "Rokiatou Ilboudo", firstName: "Rokiatou", initials: "RI", level: "conseillere", levelLabel: "Conseillère" };
    const col = buildColumn(person, [
      item({ key: "late", ownerId: "c", dueDate: "2026-10-13" }),
      item({ key: "now", ownerId: "c", dueTime: "12:00", timeMode: "at" }),
      item({ key: "d1", ownerId: "c", status: "fait", completedAt: "2026-10-12T10:00:00Z", dueDate: "2026-10-12" }),
      item({ key: "d2", ownerId: "c", status: "fait", completedAt: "2026-10-14T09:00:00Z" }),
      item({ key: "old", ownerId: "c", status: "fait", completedAt: "2026-10-09T09:00:00Z", dueDate: "2026-10-09" }),
    ], now);
    assert.equal(col.todayTotal, 3);
    assert.equal(col.todayDone, 1);
    assert.equal(col.weekDone, 2);
    assert.deepEqual(col.open.map((i) => [i.key, i.late, i.current]), [["late", true, false], ["now", false, true]]);
    assert.deepEqual(col.doneDays.map((d) => d.label), ["Mer 14", "Lun 12"]);
    assert.deepEqual(col.flag, { label: "1 en retard", tone: "red" });
  });

  it("bundles completed work by the week it was completed, never the current week", () => {
    const done = [
      item({ ownerId: "c", status: "fait", completedAt: "2026-10-09T09:00:00Z", title: "A" }),
      item({ ownerId: "c", status: "fait", completedAt: "2026-10-10T23:59:00Z", title: "B" }),
      item({ ownerId: "f", status: "fait", completedAt: "2026-10-06T09:00:00Z", title: "C" }),
      item({ ownerId: "d", status: "fait", completedAt: "2026-10-01T09:00:00Z", title: "D" }),
      item({ ownerId: "d", status: "fait", completedAt: "2026-10-12T09:00:00Z", title: "This week" }),
      item({ ownerId: "d", status: "a_faire", dueDate: "2026-10-05", title: "Unfinished" }),
    ];
    const weeks = bundlePastWeeks(done, people, now);
    assert.deepEqual(weeks.map((w) => [w.label, w.total]), [
      ["Semaine du 5 au 10 octobre", 3],
      ["Semaine du 28 septembre au 3 octobre", 1],
    ]);
    assert.deepEqual(weeks[0].people.map((p) => [p.name, p.count]), [["Salif", 1], ["Rokiatou", 2]]);
    assert.deepEqual(weeks[0].people[1].items, ["B", "A"]);
  });
});

describe("new task input", () => {
  const owner = "22222222-2222-4222-8222-222222222222";

  it("accepts a clean task", () => {
    const result = parseNewTask({ ownerId: owner, title: " Flyers ", dueDate: "2026-10-14", dueTime: "18:00", note: "" }, "2026-10-14");
    assert.deepEqual(result.value.title, "Flyers");
    assert.equal(result.value.dueTime, "18:00");
    assert.equal(result.value.note, null);
  });

  it("refuses bad input with a French message", () => {
    assert.match(parseNewTask({ ownerId: "x", title: "a", dueDate: "2026-10-14" }, "2026-10-14").error, /pour qui/);
    assert.match(parseNewTask({ ownerId: owner, title: "", dueDate: "2026-10-14" }, "2026-10-14").error, /faire/);
    assert.match(parseNewTask({ ownerId: owner, title: "a", dueDate: "2026-02-30" }, "2026-10-14").error, /date/);
    assert.match(parseNewTask({ ownerId: owner, title: "a", dueDate: "2026-10-14", dueTime: "25:00" }, "2026-10-14").error, /HH:MM/);
    assert.match(parseNewTask({ ownerId: owner, title: "a", dueDate: "2026-10-01" }, "2026-10-14").error, /passée/);
    assert.match(parseNewTask({ ownerId: owner, title: "a", dueDate: "2026-10-14", propertyId: "nope" }, "2026-10-14").error, /lien/);
  });
});
