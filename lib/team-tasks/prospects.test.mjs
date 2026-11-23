// Visites 3D call tracking (migration 111): businesses, the five points of a
// call, the three-contact sequence and the daily call goal.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canSeeProspectNote,
  countCalls,
  countLabel,
  dialable,
  followUpTitle,
  legacyColumns,
  parseDailyTarget,
  parseProspect,
  parseProspectCall,
  phoneDigits,
  sequenceLabel,
  sequencePlan,
  toWorkingDay,
  weekStats,
  whatsappMessage,
  workWeek,
  EXAMPLE_TOUR_URL,
} from "./prospects.ts";

const PID = "11111111-1111-4111-8111-111111111111";

describe("phone numbers", () => {
  it("matches the same Burkina number written three ways", () => {
    assert.equal(phoneDigits("+226 70 12 34 56"), "70123456");
    assert.equal(phoneDigits("0022670123456"), "70123456");
    assert.equal(phoneDigits("70.12.34.56"), "70123456");
    assert.equal(phoneDigits("12"), null);
    assert.equal(dialable("70 12 34 56"), "+22670123456");
  });
});

describe("a business", () => {
  it("needs a name and a type, each value in its own field", () => {
    assert.match(parseProspect({ kind: "restaurant" }).error, /nom/);
    assert.match(parseProspect({ name: "Le Verdoyant" }).error, /type/);
    const ok = parseProspect({ name: " Le Verdoyant ", kind: "restaurant", phone: "+226 70 12 34 56", quartier: "Ouaga 2000", city: "Ouagadougou" });
    assert.deepEqual(ok.value, {
      name: "Le Verdoyant", kind: "restaurant", phone: "+226 70 12 34 56", phoneDigits: "70123456",
      quartier: "Ouaga 2000", city: "Ouagadougou", mapsUrl: null,
    });
  });

  it("refuses a bad number or a Maps link that is not a web address", () => {
    assert.match(parseProspect({ name: "A", kind: "hotel", phone: "abc" }).error, /numéro/);
    assert.match(parseProspect({ name: "A", kind: "hotel", mapsUrl: "maps" }).error, /https/);
  });
});

describe("the five points of a call", () => {
  it("needs who answered and the result", () => {
    assert.match(parseProspectCall({ prospectId: PID, result: "oui" }).error, /qui a répondu/);
    assert.match(parseProspectCall({ prospectId: PID, answeredBy: "patron" }).error, /résultat/);
  });

  it("« pas de réponse » takes two taps: the result defaults to « à rappeler » and the rest is dropped", () => {
    const parsed = parseProspectCall({ prospectId: PID, answeredBy: "pas_de_reponse", objection: "cher", problemWords: "x" });
    assert.equal(parsed.value.result, "a_rappeler");
    assert.equal(parsed.value.objection, null);
    assert.equal(parsed.value.problemWords, null);
  });

  it("keeps the taps and their words", () => {
    const parsed = parseProspectCall({
      prospectId: PID, answeredBy: "gerant", problemAnswer: "oui", problemWords: "Les clients demandent des photos",
      objection: "reflechir", objectionWords: "Je dois voir avec le patron", interest: "route", result: "a_rappeler",
    });
    assert.equal(parsed.value.channel, "appel");
    assert.equal(parsed.value.objection, "reflechir");
    assert.equal(parsed.value.interest, "route");
    assert.equal(parsed.value.taskId, null);
  });

  it("maps to the 092 columns so old screens keep working", () => {
    assert.deepEqual(legacyColumns({ answeredBy: "pas_de_reponse", followUp: { step: 2, dueDate: "2026-11-25" } }), {
      outcome: "pas_de_reponse", nextStep: "rappel", nextAt: "2026-11-25T10:00:00.000Z",
    });
    assert.deepEqual(legacyColumns({ answeredBy: "patron", followUp: null }), { outcome: "joint", nextStep: "rien", nextAt: null });
  });
});

describe("three contacts per business", () => {
  // 2026-11-23 is a Monday.
  it("contact 1 without a yes or no: call back on day 2", () => {
    const plan = sequencePlan({ contactNumber: 1, result: "a_rappeler", firstContactOn: "2026-11-23", todayKey: "2026-11-23" });
    assert.deepEqual(plan, { state: "en_cours", followUp: { step: 2, dueDate: "2026-11-25" } });
  });

  it("a Saturday or Sunday day 2 moves to Monday", () => {
    assert.equal(sequencePlan({ contactNumber: 1, result: "a_rappeler", firstContactOn: "2026-11-27", todayKey: "2026-11-27" }).followUp.dueDate, "2026-11-30");
    assert.equal(sequencePlan({ contactNumber: 1, result: "a_rappeler", firstContactOn: "2026-11-26", todayKey: "2026-11-26" }).followUp.dueDate, "2026-11-30");
    assert.equal(toWorkingDay("2026-11-24"), "2026-11-24");
  });

  it("contact 2 without a yes or no: WhatsApp message on day 7 after contact 1", () => {
    const plan = sequencePlan({ contactNumber: 2, result: "a_rappeler", firstContactOn: "2026-11-23", todayKey: "2026-11-25" });
    assert.deepEqual(plan.followUp, { step: 3, dueDate: "2026-11-30" });
  });

  it("a day 7 already passed moves to the next working day", () => {
    const plan = sequencePlan({ contactNumber: 2, result: "a_rappeler", firstContactOn: "2026-11-02", todayKey: "2026-11-20" });
    assert.equal(plan.followUp.dueDate, "2026-11-23");
  });

  it("oui or non closes the sequence at any contact", () => {
    assert.deepEqual(sequencePlan({ contactNumber: 1, result: "oui", firstContactOn: "2026-11-23", todayKey: "2026-11-23" }), { state: "oui", followUp: null });
    assert.deepEqual(sequencePlan({ contactNumber: 2, result: "non", firstContactOn: "2026-11-23", todayKey: "2026-11-25" }), { state: "non", followUp: null });
  });

  it("after contact 3 without an answer: « à reprendre plus tard », no new task", () => {
    assert.deepEqual(sequencePlan({ contactNumber: 3, result: "a_rappeler", firstContactOn: "2026-11-23", todayKey: "2026-11-30" }), { state: "a_reprendre", followUp: null });
    assert.equal(sequenceLabel("a_reprendre", 3), "À reprendre plus tard");
    assert.equal(sequenceLabel("en_cours", 2), "Contact 2 sur 3");
  });

  it("names the tasks and carries the example link in the WhatsApp message", () => {
    assert.equal(followUpTitle(2, "Le Verdoyant"), "Rappeler Le Verdoyant");
    assert.equal(followUpTitle(3, "Le Verdoyant"), "Message WhatsApp à Le Verdoyant");
    const message = whatsappMessage("Le Verdoyant", "Moubarak");
    assert.ok(message.includes(EXAMPLE_TOUR_URL));
    assert.ok(!/—/.test(message), "no em dash in user copy");
  });
});

describe("daily call goal", () => {
  it("the work week is Monday to Friday", () => {
    assert.deepEqual(workWeek("2026-11-25"), ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
    assert.deepEqual(workWeek("2026-11-29"), workWeek("2026-11-23"));
  });

  it("every logged call of the author counts, today and this week, against five times the goal", () => {
    const notes = [
      { author_id: "me", created_at: "2026-11-25T09:00:00Z" },
      { author_id: "me", created_at: "2026-11-25T17:59:00Z" },
      { author_id: "me", created_at: "2026-11-24T10:00:00Z" },
      { author_id: "me", created_at: "2026-11-21T10:00:00Z" },
      { author_id: "other", created_at: "2026-11-25T10:00:00Z" },
    ];
    assert.deepEqual(countCalls({ notes, userId: "me", goal: 20, todayKey: "2026-11-25" }), { goal: 20, today: 2, week: 3, weekTarget: 100, absentDays: 0 });
  });

  it("a declared absence is not a missed day", () => {
    const count = countCalls({ notes: [], userId: "me", goal: 20, todayKey: "2026-11-25", absentDays: ["2026-11-24", "2026-11-10"] });
    assert.equal(count.weekTarget, 80);
    assert.equal(count.absentDays, 1);
    assert.equal(countLabel(12, 20), "12 / 20");
    assert.equal(countLabel(12, null), "12");
  });

  it("a goal is a whole number from 1 to 200, or removed", () => {
    assert.deepEqual(parseDailyTarget(20), { value: 20 });
    assert.deepEqual(parseDailyTarget(null), { value: null });
    assert.match(parseDailyTarget(0).error, /entre 1 et 200/);
    assert.match(parseDailyTarget(2.5).error, /entre 1 et 200/);
  });
});

describe("the week's numbers and who reads them", () => {
  it("counts calls, yes and the most frequent objections", () => {
    const base = { answered_by: "patron", problem_answer: "oui", interest: "route" };
    const stats = weekStats(
      [
        { ...base, created_at: "2026-11-24T10:00:00Z", result: "oui", objection: null },
        { ...base, created_at: "2026-11-24T11:00:00Z", result: "a_rappeler", objection: "cher" },
        { ...base, created_at: "2026-11-25T11:00:00Z", result: "non", objection: "cher" },
        { ...base, created_at: "2026-11-25T12:00:00Z", result: "a_rappeler", objection: "reflechir" },
        { answered_by: "pas_de_reponse", created_at: "2026-11-25T13:00:00Z", result: "a_rappeler", objection: null, problem_answer: null, interest: null },
        { ...base, created_at: "2026-11-10T12:00:00Z", result: "oui", objection: "cher" },
      ],
      "2026-11-25",
    );
    assert.equal(stats.calls, 5);
    assert.equal(stats.answered, 4);
    assert.equal(stats.yes, 1);
    assert.deepEqual(stats.objections.map((o) => [o.label, o.count]), [["C’est cher", 2], ["Je vais réfléchir", 1]]);
  });

  it("a caller reads their own calls, the Directeur and the founder all", () => {
    assert.equal(canSeeProspectNote({ id: "a", level: "conseillere" }, { author_id: "a" }), true);
    assert.equal(canSeeProspectNote({ id: "a", level: "stagiaire" }, { author_id: "b" }), false);
    assert.equal(canSeeProspectNote({ id: "a", level: "directeur" }, { author_id: "b" }), true);
  });
});

describe("migration 111", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/111_visites_3d_call_tracking.sql", import.meta.url), "utf8");
  it("keeps the new tables service-role only", () => {
    for (const table of ["staff_prospects", "staff_call_goals", "staff_call_goal_changes"]) {
      assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated`));
    }
  });
  it("allows the visite_3d subject and requires who answered and the result", () => {
    assert.match(sql, /'visite_3d'/);
    assert.match(sql, /answered_by IS NOT NULL AND result IS NOT NULL/);
  });
});
