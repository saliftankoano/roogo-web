// Keeps lib/access/matrix.ts (the "Qui peut faire quoi" page) in sync with
// the real permission helpers and with the files it cites. If one of these
// fails, the code changed: update the matrix (and the page) in the same change.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  AREAS,
  LEVELS,
  LEVEL_NAMES,
  PLANNED,
  STAFF_JOIN,
  TASK_ASSIGNMENT,
  allRules,
  findRule,
} from "./matrix.ts";
import {
  DEFAULT_STAFF_TITLE,
  LEVEL_LABELS,
  STAFF_TITLES,
  assignmentKind,
  isDirectorOrFounder,
  levelFor,
} from "../team-tasks/core.ts";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");

function walk(dir, name) {
  const out = [];
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, name));
    else if (entry.name === name) out.push(rel);
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

  it("a staff account without a title is Conseiller(ère), and Fondateur comes from the account type", () => {
    assert.equal(DEFAULT_STAFF_TITLE, "conseillere");
    assert.equal(levelFor("staff", null), "conseillere");
    assert.equal(levelFor("founder", "stagiaire"), "fondateur");
    assert.match(findRule("join").detail ?? "", /code staff/);
    assert.ok(STAFF_JOIN.steps.some((step) => step.includes(LEVEL_NAMES[DEFAULT_STAFF_TITLE])));
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
    for (const id of ["board", "auto-assign", "fiche-suivi"]) {
      const rule = findRule(id);
      assert.deepEqual(who(rule), expected, id);
      assert.ok(
        rule.files.some((f) => !f.endsWith("/") && /isDirectorOrFounder/.test(read(f))),
        `${id} must cite a file that calls isDirectorOrFounder`,
      );
    }
  });
});

describe("access matrix: founder-only areas", () => {
  const founderOnly = allRules().filter((rule) => who(rule).join() === "fondateur" && rule.access.directeur === "non");

  it("lists exactly the founder-only actions the code has", () => {
    assert.deepEqual(founderOnly.map((r) => r.id).sort(), ["demande-answer", "finances", "referral-paid", "settings", "titles"].sort());
  });

  it("each founder-only action cites a file with a founder check", () => {
    for (const rule of founderOnly) {
      assert.ok(
        rule.files.some((f) => !f.endsWith("/") && /"founder"|isFounder/.test(read(f))),
        `${rule.id} must cite a file that checks the founder`,
      );
    }
  });

  it("the founder-only menu links are the menu-enforced founder-only rules", () => {
    const nav = read("lib/navigation/adminNav.ts");
    const block = nav.slice(nav.indexOf("founderPilotageNavItems"), nav.indexOf("export function getAdminNavItems"));
    const hrefs = [...block.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(hrefs, ["/admin/finances", "/admin/parametres"]);
    const menuRules = allRules().filter((r) => r.enforcedBy.includes("menu")).map((r) => r.id).sort();
    assert.deepEqual(menuRules, ["finances", "settings"]);
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

  it("the Studio caps in the text are the defaults in the code", () => {
    const server = read("lib/studio/server.ts");
    const media = Number(/FALLBACK_DEFAULT_CAP_USD = (\d+(?:\.\d+)?)/.exec(server)?.[1]);
    const video = Number(/FALLBACK_VIDEO_CAP_USD = (\d+(?:\.\d+)?)/.exec(server)?.[1]);
    const text = findRule("studio-use").detail ?? "";
    assert.match(text, new RegExp(`${media} USD pour les visuels`));
    assert.match(text, new RegExp(`${video} USD pour les vidéos`));
    assert.match(PLANNED.find((p) => p.id === "p-studio-caps").today, new RegExp(`${video} et ${media} USD`));
  });

  it("the staff code still works as the page describes it", () => {
    const route = read("app/api/auth/verify-staff-code/route.ts");
    assert.match(route, /STAFF_REGISTRATION_SECRET/);
    assert.match(route, /userType: "staff"/);
    assert.doesNotMatch(route, /staff_titles|invitation/i, "the join flow changed: update STAFF_JOIN and the page");
  });

  it("no em dash and no emoji in the page text", () => {
    const text = JSON.stringify({ AREAS, PLANNED, STAFF_JOIN });
    assert.doesNotMatch(text, /—/);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
  });
});
