import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABSENCE_CATEGORIES,
  canDeclareAbsence,
  canReadReport,
  canSeeAbsenceNote,
  cleanActions,
  eodWindow,
  ouagaDay,
  ownReportPatch,
  parseAbsence,
  parseDayReport,
  planActions,
  reportChip,
  reportWeekDays,
  toReportView,
  tomorrowKey,
  weekImprovements,
  weekSummary,
} from "./day-reports.ts";
import { dayKey } from "./core.ts";

const at = (iso) => new Date(iso);

const director = { id: "dir", level: "directeur" };
const founder = { id: "fon", level: "fondateur" };
const advisor = { id: "moub", level: "conseillere" };
const intern = { id: "stag", level: "stagiaire" };
const assistant = { id: "asst", level: "assistant" };

function row(overrides = {}) {
  return {
    id: "r1",
    user_id: "moub",
    report_date: "2026-10-19",
    done_items: [{ title: "Visite Balkuy" }],
    done_extra: null,
    tomorrow_actions: [{ title: "Rappeler le propriétaire", task_id: "t1" }],
    went_wrong: "Client en retard d’une heure.",
    improvement: "Confirmer la veille par WhatsApp.",
    absent: false,
    absence_category: null,
    absence_note: null,
    declared_by: null,
    submitted_at: "2026-10-19T17:42:00.000Z",
    created_at: "2026-10-19T17:42:00.000Z",
    updated_at: "2026-10-19T17:42:00.000Z",
    ...overrides,
  };
}

describe("end-of-day window, Ouagadougou time (UTC, no daylight saving)", () => {
  it("is closed before 15:00, open from 15:00, highlighted from 17:30 until midnight", () => {
    assert.equal(eodWindow(at("2026-10-19T08:00:00Z")), "closed");
    assert.equal(eodWindow(at("2026-10-19T14:59:59Z")), "closed");
    assert.equal(eodWindow(at("2026-10-19T15:00:00Z")), "open");
    assert.equal(eodWindow(at("2026-10-19T17:29:59Z")), "open");
    assert.equal(eodWindow(at("2026-10-19T17:30:00Z")), "due");
    assert.equal(eodWindow(at("2026-10-19T23:59:00Z")), "due");
    assert.equal(eodWindow(at("2026-10-20T00:00:00Z")), "closed");
  });

  it("does not follow the machine time zone: an offset instant gives the Ouagadougou hour", () => {
    // 18:00 in Paris summer time (UTC+2) is 16:00 in Ouagadougou.
    assert.equal(eodWindow(at("2026-07-01T18:00:00+02:00")), "open");
    // 01:00 in Paris on the 20th is still the 19th, 23:00, in Ouagadougou.
    assert.equal(ouagaDay(at("2026-10-20T01:00:00+02:00")), "2026-10-19");
    assert.equal(ouagaDay(at("2026-10-20T01:00:00+02:00")), dayKey(at("2026-10-20T01:00:00+02:00")));
  });

  it("tomorrow skips Sunday, like « Demain » in the briefing", () => {
    assert.equal(tomorrowKey("2026-10-19"), "2026-10-20"); // Monday -> Tuesday
    assert.equal(tomorrowKey("2026-10-24"), "2026-10-26"); // Saturday -> Monday
  });
});

describe("who reads what", () => {
  it("Conseiller(ère), Assistant(e) and Stagiaire read only their own report; Directeur and Fondateur read everyone's", () => {
    const mine = row({ user_id: "moub" });
    const other = row({ user_id: "asst" });
    assert.equal(canReadReport(advisor, mine), true);
    assert.equal(canReadReport(advisor, other), false);
    assert.equal(canReadReport(intern, other), false);
    assert.equal(canReadReport(assistant, mine), false);
    assert.equal(canReadReport(director, other), true);
    assert.equal(canReadReport(founder, other), true);
    assert.equal(toReportView(intern, other), null);
  });

  it("the absence note: Directeur and Fondateur always, the person only when they wrote it, nobody else", () => {
    const self = row({ absent: true, absence_category: "maladie", absence_note: "Revient jeudi", declared_by: "moub" });
    const byDirector = row({ absent: true, absence_category: "urgence_familiale", absence_note: "Appel à 8 h", declared_by: "dir" });
    assert.equal(canSeeAbsenceNote(director, self), true);
    assert.equal(canSeeAbsenceNote(founder, byDirector), true);
    assert.equal(canSeeAbsenceNote(advisor, self), true);
    assert.equal(canSeeAbsenceNote(advisor, byDirector), false);
    assert.equal(canSeeAbsenceNote(intern, self), false);
    assert.equal(canSeeAbsenceNote(assistant, byDirector), false);
  });

  it("the view removes a hidden note and says it exists, keeps it for the Directeur", () => {
    const byDirector = row({ absent: true, absence_category: "urgence_familiale", absence_note: "Appel à 8 h", declared_by: "dir", submitted_at: null });
    const names = new Map([["dir", { firstName: "Ablassé" }]]);
    const forHim = toReportView(advisor, byDirector, names);
    assert.equal(forHim.absenceNote, null);
    assert.equal(forHim.absenceNoteHidden, true);
    assert.equal(forHim.declaredForThem, true);
    assert.equal(forHim.declaredByName, "Ablassé");
    assert.equal(toReportView(director, byDirector, names).absenceNote, "Appel à 8 h");
    assert.equal(toReportView(founder, byDirector, names).absenceNote, "Appel à 8 h");
  });

  it("only the Directeur and the Fondateur declare an absence for someone, and nobody does it for the Fondateur", () => {
    assert.equal(canDeclareAbsence(director, advisor), true);
    assert.equal(canDeclareAbsence(founder, advisor), true);
    assert.equal(canDeclareAbsence(director, director), true);
    assert.equal(canDeclareAbsence(director, founder), false);
    assert.equal(canDeclareAbsence(founder, founder), true);
    for (const actor of [advisor, intern, assistant]) {
      assert.equal(canDeclareAbsence(actor, advisor), false);
      assert.equal(canDeclareAbsence(actor, actor), false);
    }
  });
});

describe("status chip", () => {
  it("not sent, sent, absent (an absence wins over a sent report)", () => {
    assert.deepEqual(reportChip(null), { status: "pending", label: "Pas encore envoyé", tone: "amber" });
    assert.equal(reportChip(row({ submitted_at: null })).label, "Pas encore envoyé");
    assert.deepEqual(reportChip(row()), { status: "sent", label: "Compte rendu envoyé", tone: "green" });
    assert.equal(reportChip(row({ absent: true, absence_category: "urgence_familiale", submitted_at: null })).label, "Absent (urgence familiale)");
    assert.equal(reportChip(row({ absent: true, absence_category: "conge" })).status, "absent");
    assert.equal(reportChip(row({ absent: true, absence_category: "maladie" })).label, "Absent (maladie)");
  });
});

describe("the form", () => {
  it("needs at least one action for tomorrow unless absent, and a category when absent", () => {
    assert.match(parseDayReport({ tomorrowActions: [] }).error, /au moins une action/);
    assert.match(parseDayReport({ tomorrowActions: ["  "] }).error, /au moins une action/);
    assert.ok("value" in parseDayReport({ tomorrowActions: ["Appeler Awa"] }));
    assert.match(parseDayReport({ absent: true }).error, /raison/);
    const absent = parseDayReport({ absent: true, absenceCategory: "maladie" });
    assert.equal(absent.value.absent, true);
    assert.deepEqual(absent.value.tomorrowActions, []);
    assert.match(parseDayReport({ absent: true, absenceCategory: "malade" }).error, /raison/);
  });

  it("keeps the two reflection fields and drops the note when not absent", () => {
    const parsed = parseDayReport({
      tomorrowActions: ["Appeler Awa"],
      wentWrong: "  Perdu une heure  ",
      improvement: "Préparer la veille",
      absenceCategory: "maladie",
      absenceNote: "x",
    }).value;
    assert.equal(parsed.wentWrong, "Perdu une heure");
    assert.equal(parsed.improvement, "Préparer la veille");
    assert.equal(parsed.absenceCategory, null);
    assert.equal(parsed.absenceNote, null);
  });

  it("actions are one line each, 5 at most, blanks and repeats dropped", () => {
    assert.deepEqual(cleanActions(["Appeler\nAwa", "", "appeler awa", "Visite"]).value, ["Appeler Awa", "Visite"]);
    assert.match(cleanActions(["a", "b", "c", "d", "e", "f"]).error, /5 actions au plus/);
    assert.match(cleanActions(["x".repeat(201)]).error, /trop longue/);
    assert.match(cleanActions("Appeler").error, /pas valides/);
  });

  it("editing the same day keeps the tasks already made, creates the new ones and removes those taken out", () => {
    const plan = planActions(["Appeler Awa", "Visite Nagrin"], [
      { title: "appeler awa", task_id: "t1" },
      { title: "Photos Zagtouli", task_id: "t2" },
    ]);
    assert.deepEqual(plan.keep, [{ title: "Appeler Awa", task_id: "t1" }]);
    assert.deepEqual(plan.create, ["Visite Nagrin"]);
    assert.deepEqual(plan.remove, ["t2"]);
    assert.deepEqual(planActions(["A"], null), { keep: [], create: ["A"], remove: [] });
  });

  it("a person keeping an absence the Directeur declared keeps his note and his name", () => {
    const input = parseDayReport({ absent: true, absenceCategory: "urgence_familiale" }).value;
    const patch = ownReportPatch(input, { absent: true, absence_note: "Appel à 8 h", declared_by: "dir" }, "moub", [], "2026-10-19T18:00:00Z");
    assert.equal(patch.absence_note, "Appel à 8 h");
    assert.equal(patch.declared_by, "dir");
    const own = ownReportPatch(input, null, "moub", [], "2026-10-19T18:00:00Z");
    assert.equal(own.declared_by, "moub");
    const back = ownReportPatch(parseDayReport({ tomorrowActions: ["A"] }).value, { absent: true, absence_note: "x", declared_by: "dir" }, "moub", [], "2026-10-19T18:00:00Z");
    assert.equal(back.absent, false);
    assert.equal(back.absence_note, null);
    assert.equal(back.declared_by, null);
  });

  it("absence declared for someone: a person, a day from two weeks back to a month ahead, a category", () => {
    const uuid = "6f1c1d6e-1d2b-4b7a-9a43-0c2f4f0f9a11";
    assert.ok("value" in parseAbsence({ userId: uuid, date: "2026-10-19", category: "urgence_familiale" }, "2026-10-19"));
    assert.match(parseAbsence({ userId: "moub", date: "2026-10-19", category: "conge" }, "2026-10-19").error, /personne/);
    assert.match(parseAbsence({ userId: uuid, date: "2026-10-01", category: "conge" }, "2026-10-19").error, /Deux semaines/);
    assert.match(parseAbsence({ userId: uuid, date: "2026-12-01", category: "conge" }, "2026-10-19").error, /Un mois/);
    assert.match(parseAbsence({ userId: uuid, date: "2026-02-30", category: "conge" }, "2026-10-19").error, /jour/);
    assert.match(parseAbsence({ userId: uuid, date: "2026-10-19", category: "medical" }, "2026-10-19").error, /raison/);
  });

  it("offers exactly four absence categories and never a medical field", () => {
    assert.deepEqual([...ABSENCE_CATEGORIES], ["maladie", "urgence_familiale", "conge", "autre"]);
  });
});

describe("weekly summary", () => {
  it("counts reports sent Monday to Friday out of 5, absences by category, Saturday not counted in x/5", () => {
    const rows = [
      row({ report_date: "2026-10-19" }),
      row({ report_date: "2026-10-20" }),
      row({ report_date: "2026-10-21", absent: true, absence_category: "urgence_familiale", submitted_at: null }),
      row({ report_date: "2026-10-24" }), // Saturday
      row({ report_date: "2026-10-12" }), // last week
      row({ user_id: "asst", report_date: "2026-10-19", submitted_at: null }),
      row({ user_id: "asst", report_date: "2026-10-22", absent: true, absence_category: "maladie" }),
    ];
    const summary = weekSummary(["moub", "asst"], rows, "2026-10-22");
    assert.equal(summary.weekStart, "2026-10-19");
    assert.equal(summary.weekEnd, "2026-10-24");
    const moub = summary.people.find((p) => p.userId === "moub");
    assert.equal(moub.sent, 2);
    assert.equal(moub.expected, 5);
    assert.deepEqual(moub.absences, { urgence_familiale: 1 });
    const asst = summary.people.find((p) => p.userId === "asst");
    assert.equal(asst.sent, 0);
    assert.deepEqual(summary.absencesByCategory, { maladie: 1, urgence_familiale: 1, conge: 0, autre: 0 });
  });

  it("on Sunday the summary is already the coming week", () => {
    assert.equal(reportWeekDays("2026-10-25")[0], "2026-10-26");
  });

  it("lists the week's improvement ideas, newest first, skipping empty ones and other weeks", () => {
    const ideas = weekImprovements(
      [
        row({ report_date: "2026-10-19", improvement: "Idée lundi" }),
        row({ user_id: "asst", report_date: "2026-10-21", improvement: "Idée mercredi" }),
        row({ report_date: "2026-10-20", improvement: "   " }),
        row({ report_date: "2026-10-12", improvement: "Ancienne" }),
      ],
      "2026-10-21",
    );
    assert.deepEqual(ideas.map((i) => i.text), ["Idée mercredi", "Idée lundi"]);
  });
});
