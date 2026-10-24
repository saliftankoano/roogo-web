// The « Abonnés YouTube » goal metric and its automatic readings.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATALOG_ORDER,
  GOAL_METRICS,
  METRICS,
  isManualMetric,
  metricDefFor,
  parseNewGoal,
  parseReading,
  readingSourceLabel,
  unitWord,
} from "./core.ts";
import { planFollowerReadings } from "./meta-followers.ts";

const TODAY = "2026-10-23";

describe("youtube_subscribers in the goal catalogue", () => {
  it("is offered in « Nouvel objectif » as « Abonnés YouTube », family YouTube, with the YouTube icon", () => {
    assert.ok(GOAL_METRICS.includes("youtube_subscribers"));
    assert.ok(CATALOG_ORDER.includes("youtube_subscribers"));
    const def = METRICS.youtube_subscribers;
    assert.equal(def.pick, "Abonnés YouTube");
    assert.equal(def.family, "YouTube");
    assert.equal(def.icon, "youtube");
    assert.equal(def.kind, "stock");
    assert.equal(def.title(500), "500 abonnés YouTube");
    assert.equal(unitWord("youtube_subscribers", 1), "abonné");
    assert.equal(unitWord("youtube_subscribers", 12), "abonnés");
  });

  it("the founder can create « 500 abonnés YouTube » for the year", () => {
    const r = parseNewGoal({ metric: "youtube_subscribers", target: 500, period: "year" }, TODAY);
    assert.ok(r.value, r.error);
    assert.equal(r.value.metric, "youtube_subscribers");
    assert.equal(r.value.target, 500);
  });

  it("is read every night once YouTube is connected, typed by hand before", () => {
    assert.equal(metricDefFor("youtube_subscribers").source, "Saisi à la main");
    assert.match(metricDefFor("youtube_subscribers").measure, /pas encore connecté/);
    const live = metricDefFor("youtube_subscribers", { youtubeConnected: true });
    assert.equal(live.source, "Lu chaque nuit");
    assert.match(live.measure, /arrondit/);
    // TikTok's flag does not switch YouTube, and the reverse.
    assert.equal(metricDefFor("youtube_subscribers", { tiktokConnected: true }).source, "Saisi à la main");
    assert.equal(metricDefFor("tiktok_followers", { youtubeConnected: true }).source, "Saisi à la main");
  });

  it("keeps manual entry as the fallback, and labels automatic readings", () => {
    assert.equal(isManualMetric("youtube_subscribers"), true);
    assert.deepEqual(parseReading({ metric: "youtube_subscribers", value: "41" }, TODAY).value, { metric: "youtube_subscribers", value: 41, measuredOn: TODAY, note: null });
    assert.equal(readingSourceLabel("youtube_subscribers", "automatique", null), "Lu automatiquement sur YouTube");
    assert.equal(readingSourceLabel("youtube_subscribers", "manuel", "Salif"), "Saisi par Salif");
  });
});

describe("youtube_subscribers readings follow the freshness rule", () => {
  it("inserts today's automatic reading, refreshes it later, never overwrites a manual one", () => {
    const result = [{ metric: "youtube_subscribers", ok: true, value: 42 }];
    assert.deepEqual(planFollowerReadings(result, [], TODAY).inserts, [{ metric: "youtube_subscribers", value: 42, measured_on: TODAY, source: "automatique" }]);
    const auto = [{ id: "r1", metric: "youtube_subscribers", measured_on: TODAY, source: "automatique", value: 40 }];
    assert.deepEqual(planFollowerReadings(result, auto, TODAY).updates, [{ id: "r1", metric: "youtube_subscribers", value: 42 }]);
    const manual = [{ id: "r2", metric: "youtube_subscribers", measured_on: TODAY, source: "manuel", value: 39 }];
    const plan = planFollowerReadings(result, manual, TODAY);
    assert.deepEqual(plan.keptManual, ["youtube_subscribers"]);
    assert.equal(plan.inserts.length + plan.updates.length, 0);
  });

  it("a failed YouTube read writes nothing and does not block the other networks", () => {
    const plan = planFollowerReadings(
      [
        { metric: "youtube_subscribers", ok: false, error: "quota" },
        { metric: "facebook_followers", ok: true, value: 900 },
      ],
      [],
      TODAY,
    );
    assert.deepEqual(plan.inserts.map((r) => r.metric), ["facebook_followers"]);
  });
});
