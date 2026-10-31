import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeContracts,
  canEnterReading,
  canManageGoals,
  canTickLever,
  countsAsUser,
  dayLabel,
  goalProgress,
  goalWindow,
  leverDoneThisWeek,
  listedInWindow,
  needLabel,
  parseLever,
  parseNewGoal,
  parseReading,
  pastMonthWindows,
  periodChoices,
  periodDates,
  quarterBounds,
  readingAt,
  readingPace,
  readingSourceLabel,
  recentPerDay,
  soldInWindow,
  shareTotals,
  teamWeek,
  weeklyCounts,
  retitleForTarget,
  suggestTitle,
  displayTitle,
  roundNice,
  nextPeriodBounds,
  nextStepDates,
  suggestNextTarget,
  nextStepFor,
  copiedLevers,
} from "./core.ts";

describe("Prochaine marche", () => {
  it("roundNice rounds up to a round number", () => {
    assert.equal(roundNice(2.5), 3);
    assert.equal(roundNice(3), 3);
    assert.equal(roundNice(9.1), 10);
    assert.equal(roundNice(12), 15);
    assert.equal(roundNice(95.2), 100);
    assert.equal(roundNice(101), 150);
    assert.equal(roundNice(999), 1000);
    assert.equal(roundNice(3447), 3500);
    assert.equal(roundNice(4308.75), 4500);
    assert.equal(roundNice(0), 1);
  });

  it("Locations 2 / 2 with about 295 days elapsed and 70 left: next step 3 in the same year", () => {
    const goal = { period: "year", start_date: "2026-01-01", end_date: "2026-12-31" };
    const dates = nextStepDates(goal, "2026-10-22");
    assert.deepEqual(dates, { startDate: "2026-01-01", endDate: "2026-12-31", nextPeriod: false, daysLeft: 70 });
    assert.equal(suggestNextTarget({ current: 2, perDay: 2 / 295, kind: "stock", dates }), 3);
    assert.equal(suggestNextTarget({ current: 2, perDay: null, kind: "stock", dates }), 3, "no pace: current × 1.5");
  });

  it("the formula: max(×1.25, current + pace × days), capped at ×2, always above current", () => {
    const dates = { startDate: "2026-01-01", endDate: "2026-12-31", nextPeriod: false, daysLeft: 70 };
    // TikTok 3 447, 30 a day for 70 days: 5 547, capped at 6 894, rounded to 6 000.
    assert.equal(suggestNextTarget({ current: 3447, perDay: 30, kind: "stock", dates }), 6000);
    // Very fast pace: capped at twice the current number.
    assert.equal(suggestNextTarget({ current: 100, perDay: 50, kind: "stock", dates }), 200);
    // Slow pace: × 1.25 wins.
    assert.equal(suggestNextTarget({ current: 40, perDay: 0.01, kind: "flow", dates }), 50);
    // Never equal to current.
    assert.ok(suggestNextTarget({ current: 1, perDay: 0, kind: "flow", dates }) > 1);
  });

  it("14 days or less left, or ended: the next period, same metric", () => {
    assert.deepEqual(nextPeriodBounds("year", "2026-12-31"), { start: "2027-01-01", end: "2027-12-31" });
    assert.deepEqual(nextPeriodBounds("quarter", "2026-12-31"), { start: "2027-01-01", end: "2027-03-31" });
    assert.deepEqual(nextPeriodBounds("month", "2026-10-31"), { start: "2026-11-01", end: "2026-11-30" });
    const yearGoal = { period: "year", start_date: "2026-01-01", end_date: "2026-12-31" };
    const late = nextStepDates(yearGoal, "2026-12-20");
    assert.equal(late.nextPeriod, true);
    assert.equal(late.startDate, "2027-01-01");
    const after = nextStepDates(yearGoal, "2027-01-01");
    assert.deepEqual([after.startDate, after.endDate, after.nextPeriod], ["2027-01-01", "2027-12-31", true]);
    // A flow metric restarts at 0 in the new year: the yearly pace drives the target.
    // 10 listings in 2026 (pace 10/365): 12.5 → 15 for 2027.
    assert.equal(suggestNextTarget({ current: 10, perDay: 10 / 365, kind: "flow", dates: after }), 15);
    assert.equal(nextStepDates({ period: "recurring_month", start_date: "2026-10-01", end_date: null }, "2026-10-22"), null);
  });

  it("nextStepFor: founder only, once reached or ended, with the title rewritten", () => {
    const goal = { period: "year", start_date: "2026-01-01", end_date: "2026-12-31", title: "2 biens loués sous contrat Roogo", target: 2, metric: "properties_under_contract" };
    const base = { goal, current: 2, reached: true, perDay: 2 / 295, todayKey: "2026-10-22" };
    const founder = nextStepFor({ ...base, canManage: true });
    assert.equal(founder.target, 3);
    assert.equal(founder.title, "3 biens loués sous contrat Roogo");
    assert.equal(founder.endPhrase, "avant le 31 décembre");
    assert.equal(nextStepFor({ ...base, canManage: false }), null, "team members only see « Atteint »");
    assert.equal(nextStepFor({ ...base, canManage: true, current: 1, reached: false }), null, "not before it is reached");
    const ended = nextStepFor({ ...base, canManage: true, current: 1, reached: false, todayKey: "2027-01-01" });
    assert.equal(ended.nextPeriod, true);
    assert.equal(ended.endPhrase, "avant le 31 décembre");
    assert.equal(ended.endDate, "2027-12-31");
  });

  it("copiedLevers keeps owners, rhythm and weekly targets, skips removed levers", () => {
    const rows = copiedLevers(
      [
        { owner_id: "u1", title: "Appeler 5 propriétaires", rhythm: "Chaque semaine", weekly_target: 5, sort_order: 0 },
        { owner_id: "u2", title: "Ancien levier", rhythm: null, weekly_target: 1, sort_order: 1, archived_at: "2026-10-01T00:00:00Z" },
      ],
      "new-goal",
      "founder",
    );
    assert.deepEqual(rows, [
      { goal_id: "new-goal", owner_id: "u1", title: "Appeler 5 propriétaires", rhythm: "Chaque semaine", weekly_target: 5, sort_order: 0, created_by: "founder" },
    ]);
  });
});

describe("goal title follows its target", () => {
  it("replaces the old target written the French way", () => {
    assert.equal(retitleForTarget("1 000 abonnés TikTok", 1000, 5000), "5 000 abonnés TikTok");
    assert.equal(retitleForTarget("1 000 abonnés TikTok", 1000, 5000), "5 000 abonnés TikTok");
    assert.equal(retitleForTarget("1 000 abonnés TikTok", 1000, 5000), "5 000 abonnés TikTok");
    assert.equal(retitleForTarget("1000 abonnés TikTok", 1000, 5000), "5 000 abonnés TikTok");
  });
  it("small numbers: 2 biens vendus becomes 3, never inside a bigger number", () => {
    assert.equal(retitleForTarget("2 biens vendus", 2, 3), "3 biens vendus");
    assert.equal(retitleForTarget("12 biens vendus", 2, 3), "12 biens vendus");
    assert.equal(retitleForTarget("Vendre 2 biens en 2026", 2, 3), "Vendre 3 biens en 2026");
    assert.equal(retitleForTarget("10 000 abonnés", 1000, 5000), "10 000 abonnés");
  });
  it("leaves a custom title without the old number unchanged", () => {
    assert.equal(retitleForTarget("Devenir la référence sur TikTok", 1000, 5000), "Devenir la référence sur TikTok");
    assert.equal(retitleForTarget("1 000 abonnés", 1000, 1000), "1 000 abonnés");
  });
  it("suggests a fix for a title already left stale", () => {
    assert.equal(suggestTitle("1 000 abonnés TikTok", 5000, 5000), "5 000 abonnés TikTok");
    assert.equal(suggestTitle("1 000 abonnés TikTok", 1000, 5000), "5 000 abonnés TikTok");
    assert.equal(suggestTitle("5 000 abonnés TikTok", 5000, 5000), null);
    assert.equal(suggestTitle("Devenir la référence", 5000, 6000), null);
  });
});

const TODAY = "2026-10-16"; // a Friday
const year2026 = { period: "year", start_date: "2026-01-01", end_date: "2026-12-31" };

describe("goal periods and countdown", () => {
  it("a 2026 goal on 16 October: Année 2026, encore 76 j, before 31 December", () => {
    const w = goalWindow(year2026, TODAY);
    assert.equal(w.label, "Année 2026");
    assert.equal(w.tab, "annee");
    assert.equal(w.daysLeft, 76);
    assert.equal(w.countdown, "encore 76 j");
    assert.equal(w.endPhrase, "avant le 31 décembre");
  });

  it("this month: Octobre, 15 days left; last day says so; after the end says terminé", () => {
    const month = { period: "month", ...{ start_date: "2026-10-01", end_date: "2026-10-31" } };
    assert.equal(goalWindow(month, TODAY).label, "Octobre");
    assert.equal(goalWindow(month, TODAY).countdown, "encore 15 j");
    assert.equal(goalWindow(month, "2026-10-31").countdown, "dernier jour");
    const over = goalWindow(month, "2026-11-02");
    assert.equal(over.ended, true);
    assert.equal(over.countdown, "terminé le 31 octobre");
  });

  it("quarter ends: T4 ends 31 December, T1 ends 31 March, T3 ends 30 September", () => {
    assert.deepEqual(quarterBounds("2026-11-20"), { start: "2026-10-01", end: "2026-12-31", quarter: 4 });
    assert.deepEqual(quarterBounds("2026-02-10"), { start: "2026-01-01", end: "2026-03-31", quarter: 1 });
    assert.equal(quarterBounds("2026-07-01").end, "2026-09-30");
    const w = goalWindow({ period: "quarter", start_date: "2026-10-01", end_date: "2026-12-31" }, TODAY);
    assert.equal(w.label, "T4 2026");
    assert.equal(w.tab, "trimestre");
  });

  it("writes dates the French way: 1er août, 16 octobre", () => {
    assert.equal(dayLabel("2026-08-01"), "1er août");
    assert.equal(dayLabel("2026-10-16"), "16 octobre");
    assert.equal(dayLabel("2025-12-31", TODAY), "31 décembre 2025");
  });

  it("stores the right dates for each period chosen today", () => {
    assert.deepEqual(periodDates("month", TODAY), { startDate: "2026-10-01", endDate: "2026-10-31" });
    assert.deepEqual(periodDates("recurring_month", TODAY), { startDate: "2026-10-01", endDate: null });
    assert.deepEqual(periodDates("quarter", TODAY), { startDate: "2026-10-01", endDate: "2026-12-31" });
    assert.deepEqual(periodDates("year", TODAY), { startDate: "2026-01-01", endDate: "2026-12-31" });
    assert.deepEqual(periodDates("month", "2026-02-10"), { startDate: "2026-02-01", endDate: "2026-02-28" });
    assert.deepEqual(periodChoices(TODAY).map((c) => c.label), ["Ce mois", "Chaque mois", "Ce trimestre", "Cette année"]);
  });

  it("a recurring month starts again on the 1st and keeps past months as history", () => {
    const goal = { period: "recurring_month", start_date: "2026-08-01", end_date: null };
    const oct = goalWindow(goal, TODAY);
    assert.deepEqual([oct.startKey, oct.endKey, oct.label, oct.tab], ["2026-10-01", "2026-10-31", "Chaque mois", "mois"]);
    const nov = goalWindow(goal, "2026-11-01");
    assert.deepEqual([nov.startKey, nov.endKey, nov.daysLeft], ["2026-11-01", "2026-11-30", 29]);
    assert.deepEqual(pastMonthWindows(goal, "2026-11-01").map((m) => m.label), ["Octobre", "Septembre", "Août"]);
    assert.deepEqual(pastMonthWindows(goal, TODAY).map((m) => [m.startKey, m.endKey]), [["2026-09-01", "2026-09-30"], ["2026-08-01", "2026-08-31"]]);
  });

  it("rolls over the year end: December to January", () => {
    const goal = { period: "recurring_month", start_date: "2026-12-01", end_date: null };
    const jan = goalWindow(goal, "2027-01-05");
    assert.deepEqual([jan.startKey, jan.endKey], ["2027-01-01", "2027-01-31"]);
    assert.deepEqual(pastMonthWindows(goal, "2027-01-05").map((m) => m.label), ["Décembre 2026"]);
  });

  it("a recurring goal created mid-month counts from its creation month, not before", () => {
    const goal = { period: "recurring_month", start_date: "2026-10-01", end_date: null };
    assert.deepEqual(pastMonthWindows(goal, TODAY), []);
  });
});

describe("pace and status", () => {
  const w = goalWindow(year2026, TODAY);

  it("says the required pace in words", () => {
    assert.equal(needLabel(305 / 77), "4 par jour");
    assert.equal(needLabel(2 / 77), "1 toutes les 5 semaines");
    assert.equal(needLabel(3 / 7), "3 par semaine");
    assert.equal(needLabel(0), "Rien de plus");
  });

  it("users: real pace above the required pace is En bonne voie", () => {
    const p = goalProgress({ current: 695, target: 1000, window: w, todayKey: TODAY, kind: "stock", actualPerDay: 191 / 28 });
    assert.equal(p.label, "En bonne voie");
    assert.equal(p.remaining, 305);
    assert.equal(p.need, "4 par jour");
    assert.equal(p.pct, 70);
  });

  it("a single follower reading has no real pace yet: À suivre", () => {
    const p = goalProgress({ current: 583, target: 1000, window: w, todayKey: TODAY, kind: "stock", actualPerDay: null });
    assert.equal(p.label, "À suivre");
    assert.equal(p.tone, "amber");
  });

  it("no number at all is À suivre in grey", () => {
    const p = goalProgress({ current: null, target: 1000, window: w, todayKey: TODAY, kind: "stock" });
    assert.deepEqual([p.label, p.tone, p.pct], ["À suivre", "grey", 0]);
  });

  it("sales: none after nine months is Il faut agir; reaching the target is Atteint", () => {
    assert.equal(goalProgress({ current: 0, target: 2, window: w, todayKey: TODAY, kind: "flow" }).label, "Il faut agir");
    assert.equal(goalProgress({ current: 2, target: 2, window: w, todayKey: TODAY, kind: "stock" }).label, "Atteint");
  });

  it("a flow metric is not judged in its first week", () => {
    const month = goalWindow({ period: "month", start_date: "2026-10-01", end_date: "2026-10-31" }, "2026-10-03");
    assert.equal(goalProgress({ current: 0, target: 10, window: month, todayKey: "2026-10-03", kind: "flow" }).label, "À suivre");
  });

  it("between 60% and 100% of the required pace is À suivre, below is Il faut agir", () => {
    const req = 305 / 77;
    assert.equal(goalProgress({ current: 695, target: 1000, window: w, todayKey: TODAY, kind: "stock", actualPerDay: req * 0.7 }).label, "À suivre");
    assert.equal(goalProgress({ current: 695, target: 1000, window: w, todayKey: TODAY, kind: "stock", actualPerDay: req * 0.5 }).label, "Il faut agir");
  });

  it("a finished period that missed its target is Pas atteint", () => {
    const over = goalWindow({ period: "month", start_date: "2026-09-01", end_date: "2026-09-30" }, TODAY);
    assert.equal(goalProgress({ current: 3, target: 10, window: over, todayKey: TODAY, kind: "flow" }).label, "Pas atteint");
  });
});

describe("evidence", () => {
  it("counts users without the team and test accounts", () => {
    assert.equal(countsAsUser({ user_type: "renter", email: "a@b.bf" }), true);
    assert.equal(countsAsUser({ user_type: "staff", email: "a@roogobf.com" }), false);
    assert.equal(countsAsUser({ user_type: "founder", email: "s@roogobf.com" }), false);
    assert.equal(countsAsUser({ user_type: "owner", email: "x+clerk_test@gmail.com" }), false);
    assert.equal(countsAsUser({ user_type: "owner", email: "x@example.com" }), false);
    assert.equal(countsAsUser({ user_type: null, email: null }), true);
  });

  it("groups new accounts by calendar week (counts only), newest first", () => {
    const weeks = weeklyCounts([
      "2026-10-12T08:00:00Z", "2026-10-16T23:00:00Z", // this week (Mon 12)
      "2026-10-11T23:59:00Z", "2026-10-05T00:00:00Z", // week of 5 Oct (Sunday 11 included)
      "2026-08-01T00:00:00Z", // too old
    ], TODAY, 3);
    assert.deepEqual(weeks.map((w) => [w.label, w.count]), [["Cette sem.", 2], ["5 oct.", 2], ["28 sept.", 0]]);
    assert.ok(weeks.every((w) => !("email" in w) && !("name" in w)));
  });

  it("measures the recent pace over 28 days", () => {
    assert.equal(recentPerDay(["2026-10-16T01:00:00Z", "2026-09-19T01:00:00Z", "2026-09-18T01:00:00Z"], TODAY, 28), 2 / 28);
  });

  it("reads followers at a date and their pace once two readings are a week apart", () => {
    const readings = [
      { value: 583, measured_on: "2026-10-16" },
      { value: 540, measured_on: "2026-10-12" },
    ];
    assert.equal(readingAt(readings, "2026-10-14").value, 540);
    assert.equal(readingAt(readings, "2026-10-01"), null);
    assert.equal(readingPace(readings, TODAY), null);
    assert.equal(readingPace([...readings, { value: 500, measured_on: "2026-10-02" }], TODAY), 83 / 14);
  });

  it("listings: online in the period count, pending ones show without counting, tests never", () => {
    const rows = [
      { id: "a", status: "en_ligne", is_test: false, published_at: "2026-10-05T10:00:00Z", created_at: "2026-10-04T10:00:00Z" },
      { id: "b", status: "locked", is_test: false, published_at: "2026-10-02T10:00:00Z", created_at: "2026-10-01T10:00:00Z" },
      { id: "c", status: "en_ligne", is_test: false, published_at: "2026-09-30T10:00:00Z", created_at: "2026-09-29T10:00:00Z" },
      { id: "d", status: "en_ligne", is_test: true, published_at: "2026-10-06T10:00:00Z", created_at: "2026-10-06T10:00:00Z" },
      { id: "e", status: "en_attente", is_test: false, published_at: null, created_at: "2026-10-10T10:00:00Z" },
    ];
    const { counted, pending } = listedInWindow(rows, { startKey: "2026-10-01", endKey: "2026-10-31" });
    assert.deepEqual(counted.map((r) => r.id), ["a", "b"]);
    assert.deepEqual(pending.map((r) => r.id), ["e"]);
  });

  it("contracts: one per property, active only, test listings excluded", () => {
    const rows = [
      { status: "active", property_id: "loc26", start_date: "2026-02-01", property: { is_test: false } },
      { status: "active", property_id: "loc20", start_date: "2026-08-01", property: { is_test: false } },
      { status: "active", property_id: "loc20", start_date: "2026-01-01", property: { is_test: false } },
      { status: "ended", property_id: "x", start_date: "2026-03-01", property: { is_test: false } },
      { status: "active", property_id: "t", start_date: "2026-03-01", property: { is_test: true } },
    ];
    assert.deepEqual(activeContracts(rows).map((r) => r.property_id), ["loc20", "loc26"]);
  });

  it("sold: status vendu with a signature date inside the window, any type, test listings excluded, newest first", () => {
    const rows = [
      { id: "ven011", status: "expired", is_test: false, sold_at: null },
      { id: "terrain", status: "vendu", is_test: false, sold_at: "2026-03-01T00:00:00.000Z" },
      { id: "old", status: "vendu", is_test: false, sold_at: "2025-12-31T00:00:00.000Z" },
      { id: "villa", status: "vendu", is_test: false, sold_at: "2026-10-01T00:00:00.000Z" },
      { id: "test", status: "vendu", is_test: true, sold_at: "2026-05-01T00:00:00.000Z" },
      { id: "nodate", status: "vendu", is_test: false, sold_at: null },
      { id: "back-online", status: "en_ligne", is_test: false, sold_at: "2026-04-01T00:00:00.000Z" },
    ];
    const year = { startKey: "2026-01-01", endKey: "2026-12-31" };
    assert.deepEqual(soldInWindow(rows, year).map((r) => r.id), ["villa", "terrain"]);
    assert.deepEqual(soldInWindow(rows, { startKey: "2026-10-01", endKey: "2026-10-31" }).map((r) => r.id), ["villa"]);
    assert.deepEqual(soldInWindow(rows, { startKey: "2026-12-31", endKey: "2026-12-31" }), []);
    // The last day of the window counts.
    assert.deepEqual(soldInWindow([{ id: "d", status: "vendu", is_test: false, sold_at: "2026-12-31T00:00:00.000Z" }], year).map((r) => r.id), ["d"]);
  });
});

describe("levers", () => {
  it("counts this team week's ticks and done linked tasks (Monday to Saturday)", () => {
    assert.deepEqual(teamWeek(TODAY), { startKey: "2026-10-12", endKey: "2026-10-17", endExclusiveKey: "2026-10-18" });
    const done = leverDoneThisWeek(
      [{ ticked_on: "2026-10-12" }, { ticked_on: "2026-10-16" }, { ticked_on: "2026-10-10" }],
      [{ completed_at: "2026-10-14T09:00:00Z" }, { completed_at: null }, { completed_at: "2026-10-09T09:00:00Z" }],
      TODAY,
    );
    assert.equal(done, 3);
  });

  it("my share counts each lever at most its weekly target", () => {
    assert.deepEqual(shareTotals([{ done: 9, weeklyTarget: 9 }, { done: 8, weeklyTarget: 6 }, { done: 2, weeklyTarget: 5 }]), { done: 17, target: 20 });
  });
});

describe("who may change goals", () => {
  it("only the founder manages goals; founder and Directeur enter readings", () => {
    assert.deepEqual(["fondateur", "directeur", "assistant", "conseillere", "stagiaire"].map(canManageGoals), [true, false, false, false, false]);
    assert.deepEqual(["fondateur", "directeur", "assistant", "conseillere", "stagiaire"].map(canEnterReading), [true, true, false, false, false]);
  });

  it("a lever is ticked by its owner, the Directeur or the founder", () => {
    const lever = { owner_id: "me" };
    assert.equal(canTickLever({ id: "me", level: "stagiaire" }, lever), true);
    assert.equal(canTickLever({ id: "other", level: "conseillere" }, lever), false);
    assert.equal(canTickLever({ id: "d", level: "directeur" }, lever), true);
    assert.equal(canTickLever({ id: "f", level: "fondateur" }, lever), true);
  });
});

describe("input checks", () => {
  const owner = "22222222-2222-4222-8222-222222222222";

  it("a new goal gets its dates from the period and a default title", () => {
    const r = parseNewGoal({ metric: "properties_listed_in_period", target: "10", period: "recurring_month" }, TODAY);
    assert.equal(r.value.title, "10 nouveaux biens en ligne");
    assert.equal(r.value.startDate, "2026-10-01");
    assert.equal(r.value.endDate, null);
    assert.match(parseNewGoal({ metric: "x", target: 1, period: "year" }, TODAY).error, /mesure/);
    assert.match(parseNewGoal({ metric: "users", target: 0, period: "year" }, TODAY).error, /cible/);
    assert.match(parseNewGoal({ metric: "users", target: 5, period: "week" }, TODAY).error, /période/);
  });

  it("levers need an owner, a title and a weekly target from 1 to 100", () => {
    assert.equal(parseLever({ ownerId: owner, title: " Un TikTok par jour ", rhythm: "Du lundi au samedi", weeklyTarget: 6 }).value.title, "Un TikTok par jour");
    assert.match(parseLever({ ownerId: "x", title: "a" }).error, /qui/);
    assert.match(parseLever({ ownerId: owner, title: "" }).error, /semaine/);
    assert.match(parseLever({ ownerId: owner, title: "a", weeklyTarget: 0 }).error, /1 et 100/);
  });

  it("manual readings only for follower metrics, never in the future", () => {
    assert.deepEqual(parseReading({ metric: "tiktok_followers", value: "583" }, TODAY).value, { metric: "tiktok_followers", value: 583, measuredOn: TODAY, note: null });
    assert.match(parseReading({ metric: "users", value: 3 }, TODAY).error, /tout seul/);
    assert.match(parseReading({ metric: "facebook_followers", value: 3, measuredOn: "2026-10-17" }, TODAY).error, /futur/);
    assert.match(parseReading({ metric: "facebook_followers", value: -1 }, TODAY).error, /entier/);
  });

  it("a reading says where it comes from: read automatically on Facebook or Instagram, or typed by someone", () => {
    assert.equal(readingSourceLabel("facebook_followers", "automatique", null), "Lu automatiquement sur Facebook");
    assert.equal(readingSourceLabel("instagram_followers", "automatique", null), "Lu automatiquement sur Instagram");
    assert.equal(readingSourceLabel("instagram_followers", "manuel", "Salif"), "Saisi par Salif");
    assert.equal(readingSourceLabel("tiktok_followers", undefined, "Ablassé"), "Saisi par Ablassé");
    assert.equal(readingSourceLabel("tiktok_followers", "manuel", null), "Saisi à la main");
  });
});

describe("displayTitle", () => {
  it("shows the target in a title written before the target changed", () => {
    assert.equal(displayTitle("1 000 abonnés TikTok", 5000), "5 000 abonnés TikTok");
    assert.equal(displayTitle("1000 utilisateurs sur Roogo", 1500), "1 500 utilisateurs sur Roogo");
    assert.equal(displayTitle("2 biens vendus", 3), "3 biens vendus");
  });
  it("leaves matching and custom titles alone", () => {
    assert.equal(displayTitle("2 500 abonnés Facebook", 2500), "2 500 abonnés Facebook");
    assert.equal(displayTitle("500 abonnés Instagram", 500), "500 abonnés Instagram");
    assert.equal(displayTitle("Ouvrir le bureau de Bobo", 1), "Ouvrir le bureau de Bobo");
    assert.equal(displayTitle("Objectif 2026 : 1 000 utilisateurs", 1500), "Objectif 2026 : 1 000 utilisateurs");
  });
});
