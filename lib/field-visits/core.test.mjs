import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBusinessDays,
  allUploaded,
  businessDayNote,
  canFinish,
  deliverableDates,
  ficheStatus,
  isBusinessDay,
  nextOwner,
  noteTick,
  parseFiche,
  phasesFor,
  plannedPublications,
  plannedTasks,
  prefillFacts,
  stepReadiness,
  timingSentence,
  toggleTeam,
  visitFolderName,
  visitTitle,
  whatsappShareUrl,
  whatsappText,
} from "./core.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const P = "44444444-4444-4444-8444-444444444444";
const ID = "55555555-5555-4555-8555-555555555555";

function fiche(overrides = {}) {
  return {
    id: ID,
    propertyId: P,
    kind: "location",
    person1Id: A,
    person2Id: B,
    step: 0,
    visitDate: "2026-10-14",
    checks: {},
    times: {},
    shots: {},
    location: null,
    locationSkipped: null,
    facts: {},
    batchWarnings: [],
    taskOwners: {},
    updatedAt: "2026-10-14T09:00:00.000Z",
    ...overrides,
  };
}

const allFiles = {
  marche: { ready: 2, uploading: 0, failed: 0, bytes: 1, seconds: 0 },
  photos: { ready: 34, uploading: 0, failed: 0, bytes: 1, seconds: 0 },
  presentation: { ready: 1, uploading: 0, failed: 0, bytes: 1, seconds: 0 },
  scan: { ready: 1, uploading: 0, failed: 0, bytes: 1, seconds: 0 },
  trajets: { ready: 2, uploading: 0, failed: 0, bytes: 1, seconds: 0 },
};

describe("business days", () => {
  it("skips Saturday and Sunday (paper sheet example: a Thursday visit)", () => {
    // 2026-10-15 is a Thursday.
    assert.equal(addBusinessDays("2026-10-15", 1), "2026-10-16"); // Friday
    assert.equal(addBusinessDays("2026-10-15", 2), "2026-10-19"); // Monday
    assert.equal(addBusinessDays("2026-10-15", 4), "2026-10-21"); // Wednesday
    assert.equal(addBusinessDays("2026-10-15", 5), "2026-10-22"); // next Thursday
  });

  it("a Friday visit is due on Monday", () => {
    assert.equal(addBusinessDays("2026-10-16", 1), "2026-10-19");
  });

  it("a visit on a weekend counts from the next Monday", () => {
    assert.equal(addBusinessDays("2026-10-17", 1), "2026-10-19");
    assert.equal(addBusinessDays("2026-10-18", 1), "2026-10-19");
  });

  it("zero days is the same day, and month ends roll over", () => {
    assert.equal(addBusinessDays("2026-10-14", 0), "2026-10-14");
    assert.equal(addBusinessDays("2026-10-30", 1), "2026-11-02");
  });

  it("knows weekends", () => {
    assert.equal(isBusinessDay("2026-10-17"), false);
    assert.equal(isBusinessDay("2026-10-19"), true);
  });

  it("publication dates J+1, J+2, J+4, J+5", () => {
    assert.deepEqual(deliverableDates("2026-10-14"), {
      presentation: "2026-10-15",
      marche: "2026-10-16",
      carrousel: "2026-10-20",
      video3d: "2026-10-21",
    });
    assert.equal(plannedPublications("2026-10-14").length, 4);
  });

  it("says when the weekend moved the dates", () => {
    assert.match(businessDayNote("2026-10-14"), /lundi au vendredi/); // Wednesday: J+1, J+2 in the same week
    assert.match(businessDayNote("2026-10-15"), /week-end ne compte pas/); // Thursday: J+2 is Monday
  });
});

describe("team", () => {
  it("allows two people at most", () => {
    let team = { person1Id: null, person2Id: null };
    team = toggleTeam(team, A);
    team = toggleTeam(team, B);
    assert.deepEqual(team, { person1Id: A, person2Id: B });
    assert.deepEqual(toggleTeam(team, C), team);
  });

  it("removing person 1 makes person 2 the first", () => {
    assert.deepEqual(toggleTeam({ person1Id: A, person2Id: B }, A), { person1Id: B, person2Id: null });
  });
});

describe("step readiness", () => {
  it("lists what is missing", () => {
    const r = stepReadiness(fiche({ step: 3 }), {});
    assert.equal(r.ready, false);
    assert.deepEqual(r.missing, ["l’heure", "les cases", "la position", "les 4 prises"]);
  });

  it("step 3 is complete with a skipped position", () => {
    const r = stepReadiness(
      fiche({
        step: 3,
        times: { arrivee: "2026-10-14T09:40:00Z" },
        checks: { c1: "2026-10-14T09:42:00Z" },
        locationSkipped: "Position refusée",
        shots: { marche: "x", photos: "x", presentation: "x", scan: "x" },
      }),
      {},
    );
    assert.equal(r.ready, true);
  });

  it("step 5 needs every deliverable in the Drive", () => {
    const base = fiche({ step: 5, times: { retour: "2026-10-14T11:50:00Z" }, checks: { e1: "2026-10-14T12:30:00Z" } });
    assert.deepEqual(stepReadiness(base, { ...allFiles, scan: { ready: 0, uploading: 1, failed: 0, bytes: 0, seconds: 0 } }).missing, ["l’envoi au Drive"]);
    assert.equal(stepReadiness(base, allFiles).ready, true);
    assert.equal(allUploaded(allFiles), true);
  });

  it("step 0 needs one person", () => {
    assert.deepEqual(stepReadiness(fiche({ person1Id: null, person2Id: null }), {}).missing, ["l’équipe"]);
  });

  it("finishing checks every step", () => {
    assert.equal(canFinish(fiche({ step: 5 }), allFiles).ready, false);
  });
});

describe("ticked too fast", () => {
  it("warns at the third tick within 20 seconds", () => {
    let state = noteTick([], 0);
    assert.equal(state.warn, false);
    state = noteTick(state.recent, 5_000);
    assert.equal(state.warn, false);
    state = noteTick(state.recent, 12_000);
    assert.equal(state.warn, true);
    assert.deepEqual(state.recent, []);
  });

  it("does not warn when ticks are spread out", () => {
    let state = noteTick([], 0);
    state = noteTick(state.recent, 15_000);
    state = noteTick(state.recent, 36_000);
    assert.equal(state.warn, false);
  });
});

describe("tasks", () => {
  it("person 1 and person 2 as in the canvas, due next business day", () => {
    const tasks = plannedTasks("2026-10-16", { person1Id: A, person2Id: B });
    assert.equal(tasks.length, 6);
    assert.deepEqual(tasks.map((t) => t.ownerId), [A, B, B, A, A, A]);
    assert.ok(tasks.every((t) => t.dueDate === "2026-10-19"));
    assert.equal(tasks[0].dueTime, "12:00");
    assert.equal(tasks[5].dueTime, "17:00");
  });

  it("one person does everything; chosen owners must be on the team", () => {
    const solo = plannedTasks("2026-10-14", { person1Id: A, person2Id: null });
    assert.ok(solo.every((t) => t.ownerId === A));
    const chosen = plannedTasks("2026-10-14", { person1Id: A, person2Id: B }, { t1: B, t2: C });
    assert.equal(chosen[0].ownerId, B);
    assert.equal(chosen[1].ownerId, B); // C is not on the team: default kept
  });

  it("cycles owners", () => {
    assert.equal(nextOwner(A, [A, B]), B);
    assert.equal(nextOwner(B, [A, B]), A);
  });
});

describe("parseFiche", () => {
  it("keeps known fields and normalises times", () => {
    const parsed = parseFiche({
      ...fiche({ step: 2 }),
      checks: { a1: "2026-10-14T08:52:00+00:00", zz: "2026-10-14T08:52:00Z", a2: "nope" },
      facts: { prix: "85 000", other: "x" },
      taskOwners: { t1: B, t9: A },
    });
    assert.ok("value" in parsed);
    assert.deepEqual(parsed.value.checks, { a1: "2026-10-14T08:52:00.000Z" });
    assert.deepEqual(parsed.value.facts, { prix: "85 000" });
    assert.deepEqual(parsed.value.taskOwners, { t1: B });
  });

  it("refuses the same person twice and bad steps", () => {
    assert.ok("error" in parseFiche(fiche({ person2Id: A })));
    assert.ok("error" in parseFiche(fiche({ step: 9 })));
    assert.ok("error" in parseFiche(fiche({ id: "x" })));
  });
});

describe("names and links", () => {
  it("visit title and Drive folder", () => {
    const title = visitTitle({ property_type: "appartement", quartier: "Tampouy", bedrooms: 3 });
    assert.equal(title, "Tampouy, appartement 3 ch");
    assert.equal(visitFolderName("LOC-023", title), "LOC-023 Tampouy appartement 3 ch");
    assert.equal(visitFolderName(null, "Karpala/maison"), "SANS-CODE Karpala maison");
    assert.equal(visitTitle({ property_type: "terrain", quartier: "Loumbila", area: 216 }), "Loumbila, terrain 216 m²");
  });

  it("WhatsApp share text", () => {
    const text = whatsappText("Départ du bureau", "09:05", "Tampouy", "LOC-023");
    assert.equal(text, "Départ du bureau : 09:05, Tampouy (LOC-023)");
    assert.ok(whatsappShareUrl(text).startsWith("https://wa.me/?text=D%C3%A9part"));
  });

  it("prefills facts from the listing", () => {
    assert.deepEqual(
      prefillFacts({ price: 85000, listing_type: "louer", bedrooms: 3, bathrooms: 1, amenities: ["Eau courante (ONEA)", "SONABEL", "Parking"] }),
      { prix: "85 000 FCFA / mois", pieces: "3 chambres, 1 salle de bain", eauElec: "Eau courante (ONEA), SONABEL" },
    );
    assert.deepEqual(prefillFacts({ price: 12000000, listing_type: "vendre", property_type: "terrain" }), { prix: "12 000 000 FCFA" });
  });
});

describe("follow-up", () => {
  const now = new Date("2026-10-14T10:50:00Z");
  it("on site for a while", () => {
    assert.deepEqual(
      ficheStatus({ status: "en_cours", step: 3, times: { depart: "2026-10-14T09:05:00Z", arrivee: "2026-10-14T09:40:00Z" }, uploads: {} }, now),
      { label: "Sur place depuis 1 h 10", tone: "amber" },
    );
  });

  it("back with files missing", () => {
    const s = ficheStatus({ status: "en_cours", step: 5, times: { retour: "2026-10-14T11:50:00Z" }, uploads: { ...allFiles, scan: undefined, trajets: undefined } }, now);
    assert.deepEqual(s, { label: "2 types de fichiers manquants", tone: "red" });
  });

  it("finished, then deliverables", () => {
    assert.equal(ficheStatus({ status: "termine", step: 6, times: {}, uploads: allFiles, tasksDone: 0 }, now).label, "Tournage terminé");
    assert.equal(ficheStatus({ status: "termine", step: 6, times: {}, uploads: allFiles, tasksDone: 3 }, now).label, "Livrables 3 sur 5");
  });

  it("phases", () => {
    const phases = phasesFor({
      status: "termine",
      tasks: [
        { key: "t1", status: "fait" },
        { key: "t2", status: "a_faire" },
      ],
      firstPublication: "2026-10-15",
    });
    assert.deepEqual(phases.map((p) => p.state), ["done", "current", "todo", "todo"]);
    assert.equal(phases[1].value, "En cours, 1 sur 5");
  });

  it("timing sentence", () => {
    assert.equal(
      timingSentence({ depart: "2026-10-14T09:05:00Z", arrivee: "2026-10-14T09:40:00Z", departSite: "2026-10-14T11:15:00Z", retour: "2026-10-14T11:50:00Z" }),
      "2 h 45 au total, dont 1 h 35 sur place.",
    );
  });
});
