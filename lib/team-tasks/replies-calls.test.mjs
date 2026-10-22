// Demande answers (Oui, vas-y / Pas maintenant / Écrire une réponse) and
// call tasks (call notes, the done rule, the next steps), migration 092.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callDoneError,
  callSubjectKind,
  canSeeCallNote,
  demandeActionError,
  demandeRole,
  demandeState,
  demandeUnread,
  followUpPlan,
  nextMondayKey,
  parseCallNote,
  parseNewTask,
  parseSnoozeDate,
  rowToItem,
  toDemandeView,
} from "./core.ts";

const TODAY = "2026-10-16"; // Friday
const now = new Date("2026-10-16T09:00:00Z");

function ask(overrides = {}) {
  return {
    id: "ask1", owner_id: "f", created_by: "d", kind: "demande", title: "Budget pub Balkuy", note: null,
    due_date: TODAY, due_time: null, status: "a_faire", completed_at: null, completed_by: null,
    property_id: null, visit_request_id: null, studio_project_id: null, source_key: null, source_href: null,
    reason: "La pub se termine dimanche", reply_text: null, replied_at: null, accepted_at: null,
    created_at: "2026-10-15T08:00:00Z", updated_at: "2026-10-15T08:00:00Z",
    ...overrides,
  };
}

describe("demande states", () => {
  it("reads every state, the snooze ending on its date", () => {
    assert.equal(demandeState(ask(), TODAY), "pending");
    assert.equal(demandeState(ask({ accepted_at: "t" }), TODAY), "accepted");
    assert.equal(demandeState(ask({ decision: "approved", decided_at: "t" }), TODAY), "approved");
    assert.equal(demandeState(ask({ thread_started_at: "t" }), TODAY), "thread");
    assert.equal(demandeState(ask({ thread_started_at: "t", settled_at: "t" }), TODAY), "settled");
    assert.equal(demandeState(ask({ snoozed_until: "2026-10-19" }), TODAY), "snoozed");
    assert.equal(demandeState(ask({ snoozed_until: "2026-10-19" }), "2026-10-19"), "pending");
    assert.equal(demandeState(ask({ snoozed_until: "2026-10-19", thread_started_at: "t" }), "2026-10-20"), "thread");
    assert.equal(demandeState(ask({ status: "fait", accepted_at: "t" }), TODAY), "done");
  });

  it("only the founder addressed answers with the three choices, from pending or a thread", () => {
    for (const action of ["accept", "approve", "snooze"]) {
      assert.equal(demandeActionError("pending", action, "owner"), null, action);
      assert.equal(demandeActionError("thread", action, "owner"), null, action);
      assert.match(demandeActionError("pending", action, "sender"), /Fondateur/, action);
      assert.ok(demandeActionError("pending", action, "other"), action);
      assert.match(demandeActionError("approved", action, "owner"), /déjà traitée/, action);
      assert.match(demandeActionError("snoozed", action, "owner"), /mise de côté/, action);
    }
  });

  it("the thread: the founder starts it, then only the sender and that founder write; either side settles", () => {
    assert.equal(demandeActionError("pending", "message", "owner"), null);
    assert.match(demandeActionError("pending", "message", "sender"), /Attendez/);
    assert.equal(demandeActionError("thread", "message", "sender"), null);
    assert.ok(demandeActionError("thread", "message", "other"));
    assert.equal(demandeActionError("thread", "settle", "sender"), null);
    assert.equal(demandeActionError("thread", "settle", "owner"), null);
    assert.ok(demandeActionError("pending", "settle", "owner"));
    assert.ok(demandeActionError("settled", "message", "owner"));
    assert.equal(demandeActionError("settled", "seen", "sender"), null);
    assert.ok(demandeActionError("settled", "seen", "other"));
  });

  it("knows who is who on an ask", () => {
    assert.equal(demandeRole(ask(), "f"), "owner");
    assert.equal(demandeRole(ask(), "d"), "sender");
    assert.equal(demandeRole(ask(), "x"), "other");
  });

  it("« Lundi prochain » is the next Monday, a week later on a Monday", () => {
    assert.equal(nextMondayKey(TODAY), "2026-10-19");
    assert.equal(nextMondayKey("2026-10-19"), "2026-10-26");
    assert.equal(nextMondayKey("2026-10-18"), "2026-10-19");
    assert.equal(parseSnoozeDate("2026-10-19", TODAY).value, "2026-10-19");
    assert.match(parseSnoozeDate(TODAY, TODAY).error, /après/);
    assert.match(parseSnoozeDate("nope", TODAY).error, /jour/);
  });
});

describe("demande unread signal", () => {
  const messages = [
    { id: "m1", task_id: "ask1", author_id: "f", body: "Combien ?", created_at: "2026-10-16T08:00:00Z" },
    { id: "m2", task_id: "ask1", author_id: "d", body: "50 000", created_at: "2026-10-16T08:30:00Z" },
  ];

  it("the sender sees the founder's answer as new until opened", () => {
    assert.equal(demandeUnread(ask({ decision: "approved", decided_at: "2026-10-16T07:00:00Z" }), [], "sender"), true);
    assert.equal(demandeUnread(ask({ decision: "approved", decided_at: "2026-10-16T07:00:00Z", sender_seen_at: "2026-10-16T07:05:00Z" }), [], "sender"), false);
    assert.equal(demandeUnread(ask({ snoozed_until: "2026-10-19", snoozed_at: "2026-10-16T07:00:00Z" }), [], "sender"), true);
    assert.equal(demandeUnread(ask(), [], "sender"), false);
  });

  it("in a thread, each side sees the other's last message as new", () => {
    const row = ask({ thread_started_at: "2026-10-16T08:00:00Z", sender_seen_at: "2026-10-16T08:10:00Z" });
    assert.equal(demandeUnread(row, messages, "sender"), false);
    assert.equal(demandeUnread(row, messages, "owner"), true);
    assert.equal(demandeUnread({ ...row, owner_seen_at: "2026-10-16T08:31:00Z" }, messages, "owner"), false);
  });

  it("the view carries the thread in order, with names and the snooze return date", () => {
    const names = new Map([["f", { firstName: "Salif" }], ["d", { firstName: "Ablassé" }]]);
    const view = toDemandeView(ask({ thread_started_at: "t" }), names, now, [...messages].reverse(), "d");
    assert.deepEqual(view.messages.map((m) => [m.authorName, m.body]), [["Salif", "Combien ?"], ["Ablassé", "50 000"]]);
    assert.equal(view.unread, true);
    const snoozed = toDemandeView(ask({ snoozed_until: "2026-10-19" }), names, now);
    assert.equal(snoozed.snoozedUntil, "Revient le lundi 19 octobre");
  });

  it("an approved, snoozed or threaded ask never becomes a task", () => {
    const names = new Map();
    assert.equal(rowToItem(ask({ decision: "approved", decided_at: "t" }), names), null);
    assert.equal(rowToItem(ask({ snoozed_until: "2026-10-19" }), names), null);
    assert.equal(rowToItem(ask({ thread_started_at: "t" }), names), null);
  });
});

describe("call tasks", () => {
  it("a call task cannot be ticked before a result is noted", () => {
    assert.match(callDoneError({ is_call: true }, false), /résultat/);
    assert.equal(callDoneError({ is_call: true }, true), null);
    assert.equal(callDoneError({ is_call: false }, false), null);
    assert.equal(callDoneError({}, false), null);
  });

  it("shows the Appel tag and « Pour : » on stored tasks", () => {
    const row = ask({ kind: "manuel", owner_id: "c", created_by: "d", reason: null, is_call: true, goal_id: "g1", call_phone: "+226 70 00 00 00" });
    const item = rowToItem(row, new Map(), new Map([["g1", "2 biens vendus"]]));
    assert.deepEqual([item.kindLabel, item.isCall, item.goalTitle, item.callPhone], ["Appel", true, "2 biens vendus", "+226 70 00 00 00"]);
  });

  it("call notes are seen by the author, the Directeur and the founder only", () => {
    const note = { author_id: "c" };
    assert.equal(canSeeCallNote({ id: "c", level: "conseillere" }, note), true);
    assert.equal(canSeeCallNote({ id: "x", level: "conseillere" }, note), false);
    assert.equal(canSeeCallNote({ id: "x", level: "assistant" }, note), false);
    assert.equal(canSeeCallNote({ id: "d", level: "directeur" }, note), true);
    assert.equal(canSeeCallNote({ id: "f", level: "fondateur" }, note), true);
  });

  it("files a call under Demandes, Ventes or Propriétaires from what it is linked to", () => {
    assert.equal(callSubjectKind({ propertyRequestId: "r" }), "demande");
    assert.equal(callSubjectKind({ visitRequestId: "v" }), "vente");
    assert.equal(callSubjectKind({ propertyListingType: "vendre" }), "vente");
    assert.equal(callSubjectKind({ propertyListingType: "louer" }), "proprietaire");
    assert.equal(callSubjectKind({}), "autre");
    assert.equal(callSubjectKind({ callSubject: "proprietaire", propertyRequestId: "r" }), "proprietaire");
  });

  it("validates a call note; a callback needs a future date and time", () => {
    const taskId = "22222222-2222-4222-8222-222222222222";
    const ok = parseCallNote({ taskId, outcome: "joint", notes: " Veut visiter samedi ", nextStep: "rappel", nextDate: "2026-10-17", nextTime: "10:00" }, now);
    assert.equal(ok.value.nextAt, "2026-10-17T10:00:00.000Z");
    assert.equal(ok.value.notes, "Veut visiter samedi");
    assert.match(parseCallNote({ taskId, nextStep: "rien" }, now).error, /résultat/);
    assert.match(parseCallNote({ taskId, outcome: "joint", nextStep: "plus tard" }, now).error, /ensuite/);
    assert.match(parseCallNote({ taskId, outcome: "joint", nextStep: "rappel", nextDate: "2026-10-16", nextTime: "08:00" }, now).error, /futur/);
    assert.match(parseCallNote({ taskId, outcome: "joint", nextStep: "rien", notes: "x".repeat(2001) }, now).error, /2000/);
  });

  it("plans the follow-up of each next step", () => {
    const base = { directorId: "d", founderId: "f", subject: "Client Ouaga 2000", notes: "Budget 150 000", outcome: "joint", nextAt: null, now };
    const author = { id: "c", level: "conseillere" };
    const rappel = followUpPlan({ ...base, author, step: "rappel", nextAt: "2026-10-17T10:00:00.000Z", outcome: "pas_de_reponse" });
    assert.deepEqual([rappel.ownerId, rappel.isCall, rappel.dueDate, rappel.dueTime], ["c", true, "2026-10-17", "10:00"]);
    assert.match(rappel.note, /pas de réponse/);
    const visite = followUpPlan({ ...base, author, step: "visite" });
    assert.deepEqual([visite.ownerId, visite.title, visite.isCall], ["c", "Visite à confirmer : Client Ouaga 2000", false]);
    const pass = followUpPlan({ ...base, author, step: "passer_au_directeur" });
    assert.deepEqual([pass.ownerId, pass.kind], ["d", "manuel"]);
    assert.match(pass.note, /Budget 150 000/);
    const fromDirector = followUpPlan({ ...base, author: { id: "d", level: "directeur" }, step: "passer_au_directeur" });
    assert.deepEqual([fromDirector.ownerId, fromDirector.kind], ["f", "demande"]);
    assert.ok(fromDirector.reason);
    assert.equal(followUpPlan({ ...base, author, step: "rien" }), null);
  });

  it("a new task can be a call with a number, and point at a goal", () => {
    const owner = "22222222-2222-4222-8222-222222222222";
    const goal = "33333333-3333-4333-8333-333333333333";
    const r = parseNewTask({ ownerId: owner, title: "Rappeler", dueDate: TODAY, isCall: true, callPhone: "+226 70 12 34 56", callSubject: "demande", goalId: goal }, TODAY);
    assert.deepEqual([r.value.isCall, r.value.callPhone, r.value.callSubject, r.value.goalId], [true, "+226 70 12 34 56", "demande", goal]);
    assert.match(parseNewTask({ ownerId: owner, title: "a", dueDate: TODAY, isCall: true, callPhone: "abc" }, TODAY).error, /numéro/);
    assert.match(parseNewTask({ ownerId: owner, title: "a", dueDate: TODAY, leverId: goal }, TODAY).error, /objectif/);
    assert.equal(parseNewTask({ ownerId: owner, title: "a", dueDate: TODAY, callPhone: "+226 70 12 34 56" }, TODAY).value.callPhone, null);
  });
});
