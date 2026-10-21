// Keeps lib/access/matrix.ts (the "Qui peut faire quoi" page) in sync with
// the real permission helpers and with the files it cites. If one of these
// fails, the code changed: update the matrix (and the page) in the same change.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  AREAS,
  LEGACY_MISSING,
  LEVELS,
  LEVEL_NAMES,
  PLANNED,
  STAFF_JOIN,
  TASK_ASSIGNMENT,
  UNLEVELED,
  allRules,
  findRule,
} from "./matrix.ts";
import { STAFF_CAPABILITY_MATRIX, resolveStaffLevel, staffLevelCan } from "../staff-access.ts";
import { STUDIO_CAPS_BY_LEVEL } from "../staff-team.ts";
import {
  DEFAULT_STAFF_TITLE,
  LEVEL_LABELS,
  STAFF_LEVEL_BY_TITLE,
  STAFF_TITLES,
  assignmentKind,
  isDirectorOrFounder,
  levelFor,
} from "../team-tasks/core.ts";
import { canSeeCallNote, demandeActionError } from "../team-tasks/core.ts";
import { canDeclareAbsence, canReadReport, canSeeAbsenceNote } from "../team-tasks/day-reports.ts";
import { canEnterReading, canManageGoals, canTickLever } from "../team-goals/core.ts";

/** Page column -> staff access level of lib/staff-access.ts. */
const ACCESS_LEVEL = { fondateur: "founder", ...STAFF_LEVEL_BY_TITLE };

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");

function walk(dir, name) {
  const out = [];
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, name));
    else if (name === null ? /\.(ts|tsx)$/.test(entry.name) : entry.name === name) out.push(rel);
  }
  return out;
}

const cited = allRules().flatMap((rule) => rule.files);
const isCovered = (file) => cited.some((c) => (c.endsWith("/") ? file.startsWith(c) : file === c));
const who = (rule, access = "oui") => LEVELS.filter((level) => rule.access[level] === access);

describe("access matrix: levels", () => {
  it("has the same levels and labels as lib/team-tasks/core.ts", () => {
    assert.deepEqual([...LEVELS].sort(), ["fondateur", ...STAFF_TITLES].sort());
    assert.deepEqual(LEVEL_NAMES, LEVEL_LABELS);
  });

  it("in the tasks a staff account without a level is Conseiller(ère), and Fondateur comes from the account type", () => {
    assert.equal(DEFAULT_STAFF_TITLE, "conseillere");
    assert.equal(levelFor("staff", null), "conseillere");
    assert.equal(levelFor("founder", "stagiaire"), "fondateur");
  });

  it("an unleveled staff account keeps the old access until the switch, then acts as Conseiller(ère)", () => {
    assert.equal(resolveStaffLevel({ userType: "staff", staffLevel: null }, { enforced: false }), "legacy");
    assert.equal(resolveStaffLevel({ userType: "staff", staffLevel: null }, { enforced: true }), ACCESS_LEVEL[DEFAULT_STAFF_TITLE]);
    const missing = Object.keys(STAFF_CAPABILITY_MATRIX).filter((c) => !staffLevelCan("legacy", c));
    assert.deepEqual(missing.sort(), [...LEGACY_MISSING].sort());
    assert.match(UNLEVELED.whileOff, /STAFF_LEVELS_ENFORCED/);
    assert.match(UNLEVELED.whenOn, new RegExp(LEVEL_NAMES[DEFAULT_STAFF_TITLE].replace(/[()]/g, "\\$&")));
    assert.match(read("lib/staff-access.ts"), /STAFF_LEVELS_ENFORCED === "true"/);
  });
});

describe("access matrix: tasks follow assignmentKind", () => {
  it("TASK_ASSIGNMENT matches assignmentKind for every pair of different people", () => {
    for (const actor of LEVELS) {
      for (const target of LEVELS) {
        assert.equal(
          assignmentKind({ id: "a", level: actor }, { id: "b", level: target }),
          TASK_ASSIGNMENT[actor][target],
          `${actor} -> ${target}`,
        );
      }
      assert.equal(assignmentKind({ id: "a", level: actor }, { id: "a", level: actor }), "manuel");
    }
  });

  it("giving a task to a team member: Oui exactly where assignmentKind allows it", () => {
    const rule = findRule("task-give");
    for (const level of LEVELS) {
      const allowed = LEVELS.filter((t) => t !== "fondateur").every(
        (target) => assignmentKind({ id: "a", level }, { id: "b", level: target }) === "manuel",
      );
      assert.equal(rule.access[level], allowed ? "oui" : "non", level);
    }
  });

  it("giving something to the founder: Oui exactly where assignmentKind returns a kind", () => {
    const rule = findRule("task-founder");
    for (const level of LEVELS) {
      const actorId = level === "fondateur" ? "b" : "a";
      const kind = assignmentKind({ id: actorId, level }, { id: "b", level: "fondateur" });
      assert.equal(rule.access[level], kind ? "oui" : "non", level);
      if (kind === "demande") assert.equal(rule.notes?.[level], "une demande");
    }
  });

  it("Directeur-and-Fondateur rules match isDirectorOrFounder and cite a file that calls it", () => {
    const expected = LEVELS.filter((level) => isDirectorOrFounder(level));
    for (const id of ["board", "auto-assign", "fiche-suivi", "listing-sold", "absence-declare"]) {
      const rule = findRule(id);
      assert.deepEqual(who(rule), expected, id);
      assert.ok(
        rule.files.some((f) => !f.endsWith("/") && /isDirectorOrFounder/.test(read(f))),
        `${id} must cite a file that calls isDirectorOrFounder`,
      );
    }
  });
});

describe("access matrix: goals, calls and demande answers follow their helpers", () => {
  it("goals: managing is canManageGoals, readings are canEnterReading, ticking someone else's lever is canTickLever", () => {
    for (const level of LEVELS) {
      assert.equal(findRule("goals-manage").access[level], canManageGoals(level) ? "oui" : "non", level);
      assert.equal(findRule("goal-reading").access[level], canEnterReading(level) ? "oui" : "non", level);
      const others = canTickLever({ id: "a", level }, { owner_id: "b" });
      assert.equal(findRule("lever-tick").notes?.[level], others ? "tous" : "les siens", level);
    }
  });

  it("call notes: everyone reads their own, the others' notes exactly where canSeeCallNote allows", () => {
    for (const level of LEVELS) {
      assert.equal(canSeeCallNote({ id: "a", level }, { author_id: "a" }), true);
      const others = canSeeCallNote({ id: "a", level }, { author_id: "b" });
      assert.equal(findRule("call-read").notes?.[level], others ? "toutes" : "les siennes", level);
    }
    assert.deepEqual(who(findRule("call-log")), LEVELS.filter((level) => isDirectorOrFounder(level)));
  });

  it("demande answers: the founder addressed answers, the sender writes back only in a thread", () => {
    for (const action of ["accept", "approve", "snooze"]) {
      assert.equal(demandeActionError("pending", action, "owner"), null);
      assert.ok(demandeActionError("pending", action, "sender"));
    }
    assert.equal(demandeActionError("thread", "message", "sender"), null);
    assert.ok(demandeActionError("thread", "message", "other"));
    assert.deepEqual(who(findRule("demande-thread")), ["fondateur", "directeur"]);
  });
});

describe("access matrix: end-of-day reports follow their helpers", () => {
  it("reading others' reports, absence notes and declaring absences match canReadReport, canSeeAbsenceNote and canDeclareAbsence", () => {
    for (const level of LEVELS) {
      const actor = { id: "a", level };
      const others = canReadReport(actor, { user_id: "b" });
      assert.equal(canReadReport(actor, { user_id: "a" }), true);
      assert.equal(findRule("day-report-read").notes?.[level], others ? "tous" : "le sien", level);
      assert.equal(canSeeAbsenceNote(actor, { user_id: "a", declared_by: "a" }), true);
      const otherNotes = canSeeAbsenceNote(actor, { user_id: "b", declared_by: "b" });
      assert.equal(findRule("absence-note").notes?.[level], otherNotes ? "toutes" : "celle qu’il a écrite", level);
      const declares = canDeclareAbsence(actor, { id: "b", level: "conseillere" });
      assert.equal(findRule("absence-declare").access[level], declares ? "oui" : "non", level);
    }
    assert.equal(findRule("day-report").titleMatters, false);
  });
});

describe("access matrix: founder-only areas", () => {
  const founderOnly = allRules().filter((rule) => who(rule).join() === "fondateur" && rule.access.directeur === "non");

  it("lists exactly the founder-only actions the code has", () => {
    assert.deepEqual(founderOnly.map((r) => r.id).sort(), ["demande-answer", "goals-manage", "publish-approve", "settings", "social-connect", "titles"].sort());
  });

  it("each founder-only action cites a file with a founder check", () => {
    for (const rule of founderOnly) {
      assert.ok(
        rule.files.some((f) => !f.endsWith("/") && /"founder"|isFounder|"settings\.manage"/.test(read(f))),
        `${rule.id} must cite a file that checks the founder`,
      );
    }
  });

  it("every menu-enforced rule names a capability the menu really checks", () => {
    const nav = read("lib/navigation/adminNav.ts");
    const menuRules = allRules().filter((r) => r.enforcedBy.includes("menu"));
    assert.ok(menuRules.length > 0);
    for (const rule of menuRules) {
      assert.ok(rule.capability, `${rule.id} needs a capability`);
      assert.ok(nav.includes(`needs: ["${rule.capability}"`), `${rule.id}: no menu item needs ${rule.capability}`);
    }
  });
});

describe("access matrix: follows the staff capability matrix", () => {
  const filesUnder = (entry) =>
    entry.endsWith("/") ? walk(entry.slice(0, -1), null) : [entry];
  const uses = (rule, capability) =>
    rule.files.flatMap(filesUnder).some((file) => read(file).includes(`"${capability}"`));

  it("every capability named by a rule exists", () => {
    for (const rule of allRules()) {
      for (const c of [rule.capability, rule.readCapability].filter(Boolean)) {
        assert.ok(c in STAFF_CAPABILITY_MATRIX, `${rule.id}: unknown capability ${c}`);
      }
    }
  });

  it("oui, lecture and non match the capability matrix for every level", () => {
    for (const rule of allRules().filter((r) => r.capability)) {
      for (const level of LEVELS) {
        const can = staffLevelCan(ACCESS_LEVEL[level], rule.capability);
        const canRead = rule.readCapability ? staffLevelCan(ACCESS_LEVEL[level], rule.readCapability) : can;
        const expected = can ? "oui" : canRead ? "lecture" : "non";
        assert.equal(rule.access[level], expected, `${rule.id}: ${level}`);
      }
    }
  });

  it("each such rule cites a file that checks its capability", () => {
    for (const rule of allRules().filter((r) => r.capability)) {
      assert.ok(uses(rule, rule.capability), `${rule.id} must cite a file using "${rule.capability}"`);
      if (rule.readCapability) assert.ok(uses(rule, rule.readCapability), `${rule.id} must cite a file using "${rule.readCapability}"`);
    }
  });
});

describe("access matrix: shape and honesty", () => {
  it("when the title does not matter, the five columns are identical", () => {
    for (const rule of allRules()) {
      if (rule.titleMatters) continue;
      const first = rule.access[LEVELS[0]];
      for (const level of LEVELS) {
        assert.equal(rule.access[level], first, `${rule.id}: ${level}`);
        assert.equal(rule.notes?.[level], rule.notes?.[LEVELS[0]], `${rule.id}: note ${level}`);
      }
    }
  });

  it("a rule whose columns differ says the title matters", () => {
    for (const rule of allRules()) {
      const distinct = new Set(LEVELS.map((l) => `${rule.access[l]}|${rule.notes?.[l] ?? ""}`));
      if (distinct.size > 1) assert.ok(rule.titleMatters, rule.id);
    }
  });

  it("ids are unique and every rule names how and where it is enforced", () => {
    const ids = [...allRules().map((r) => r.id), ...AREAS.map((a) => `area:${a.id}`), ...PLANNED.map((p) => p.id)];
    assert.equal(new Set(ids).size, ids.length);
    for (const rule of allRules()) {
      assert.ok(rule.enforcedBy.length > 0, rule.id);
      assert.ok(rule.files.length > 0, rule.id);
    }
  });

  it("every cited file or folder exists", () => {
    for (const file of [...cited, ...STAFF_JOIN.files]) {
      const full = path.join(root, file);
      assert.ok(existsSync(full), `missing: ${file}`);
      if (file.endsWith("/")) assert.ok(statSync(full).isDirectory(), `not a folder: ${file}`);
    }
  });

  it("every staff API route is described by at least one rule", () => {
    const routes = [...walk("app/api/admin", "route.ts"), ...walk("app/api/support/admin", "route.ts")];
    const missing = routes.filter((file) => !isCovered(file));
    assert.deepEqual(missing, [], "add these routes to lib/access/matrix.ts");
  });

  it("the Studio caps in the text are the ones in the code", () => {
    const server = read("lib/studio/server.ts");
    const media = Number(/FALLBACK_DEFAULT_CAP_USD = (\d+(?:\.\d+)?)/.exec(server)?.[1]);
    const video = Number(/FALLBACK_VIDEO_CAP_USD = (\d+(?:\.\d+)?)/.exec(server)?.[1]);
    const text = findRule("studio-use").detail ?? "";
    assert.match(text, new RegExp(`${media} USD pour les visuels`));
    assert.match(text, new RegExp(`${video} USD pour les vidéos`));
    const fr = (n) => String(n).replace(".", ",");
    for (const [title, level] of Object.entries(STAFF_LEVEL_BY_TITLE)) {
      const caps = STUDIO_CAPS_BY_LEVEL[level];
      const name = LEVEL_NAMES[title].replace(" commercial(e)", "").replace(/[()]/g, "\\$&");
      assert.match(text, new RegExp(`${name} ${fr(caps.video)}( USD)? et ${fr(caps.other)}`), title);
    }
  });

  it("the staff code still works as the page describes it: Stagiaire only, never lowering a level", () => {
    const route = read("app/api/auth/verify-staff-code/route.ts");
    assert.match(route, /STAFF_REGISTRATION_SECRET/);
    assert.match(route, /staffLevel = "intern"/);
    assert.match(route, /currentType === "staff"/);
    assert.ok(STAFF_JOIN.steps.some((step) => step.includes(LEVEL_NAMES.stagiaire)));
    assert.match(STAFF_JOIN.risk, /STAFF_REGISTRATION_SECRET/);
  });

  it("no em dash and no emoji in the page text", () => {
    const text = JSON.stringify({ AREAS, PLANNED, STAFF_JOIN, UNLEVELED });
    assert.doesNotMatch(text, /—/);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
  });
});
