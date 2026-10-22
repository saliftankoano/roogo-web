import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  fetchFollowers,
  followerTargets,
  metaErrorOf,
  parseFollowersCount,
  readingsToInsert,
  planFollowerReadings,
} from "./meta-followers.ts";

const TODAY = "2026-10-16";
const TOKEN = "secret-token-value";

function fakeFetch(status, body, seen) {
  return async (url, init) => {
    seen?.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

describe("Meta follower readings: parsing", () => {
  it("reads followers_count, refuses anything that is not a whole count", () => {
    assert.equal(parseFollowersCount({ followers_count: 1874, id: "1046356035218080" }), 1874);
    assert.equal(parseFollowersCount({ followers_count: "12" }), 12);
    assert.equal(parseFollowersCount({ followers_count: 0 }), 0);
    assert.equal(parseFollowersCount({ id: "x" }), null);
    assert.equal(parseFollowersCount({ followers_count: -1 }), null);
    assert.equal(parseFollowersCount({ followers_count: 1.5 }), null);
    assert.equal(parseFollowersCount(null), null);
  });

  it("reads the Graph error code and message", () => {
    assert.deepEqual(metaErrorOf({ error: { code: 190, message: "Error validating access token" } }), { code: 190, message: "Error validating access token" });
    assert.equal(metaErrorOf({ followers_count: 3 }), null);
  });

  it("targets come from the env, a missing id skips that metric", () => {
    assert.deepEqual(followerTargets({ META_PAGE_ID: "1046356035218080", META_IG_ACCOUNT_ID: "17841436630471998" }).map((t) => t.metric), [
      "facebook_followers",
      "instagram_followers",
    ]);
    assert.deepEqual(followerTargets({ META_PAGE_ID: " " }), []);
  });
});

describe("Meta follower readings: fetch", () => {
  it("asks v21.0 for followers_count with the token in the header, never in the URL", async () => {
    const seen = [];
    const result = await fetchFollowers({ metric: "instagram_followers", objectId: "17841436630471998" }, TOKEN, fakeFetch(200, { followers_count: 1 }, seen));
    assert.deepEqual(result, { metric: "instagram_followers", ok: true, value: 1 });
    assert.equal(seen[0].url, "https://graph.facebook.com/v21.0/17841436630471998?fields=followers_count");
    assert.equal(seen[0].init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!seen[0].url.includes(TOKEN));
  });

  it("a Meta error gives the status and code, without the token", async () => {
    const result = await fetchFollowers(
      { metric: "facebook_followers", objectId: "1046356035218080" },
      TOKEN,
      fakeFetch(400, { error: { code: 190, message: "Invalid OAuth access token." } }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.code, 190);
    assert.match(result.error, /Meta 190/);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
  });

  it("a network failure does not throw", async () => {
    const result = await fetchFollowers({ metric: "facebook_followers", objectId: "1" }, TOKEN, async () => {
      throw new Error("ECONNRESET");
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /ECONNRESET/);
  });
});

describe("Meta follower readings: one per metric per day", () => {
  const results = [
    { metric: "facebook_followers", ok: true, value: 1880 },
    { metric: "instagram_followers", ok: true, value: 2 },
  ];

  it("writes both when the day is empty, as automatique", () => {
    assert.deepEqual(readingsToInsert(results, [], TODAY), [
      { metric: "facebook_followers", value: 1880, measured_on: TODAY, source: "automatique" },
      { metric: "instagram_followers", value: 2, measured_on: TODAY, source: "automatique" },
    ]);
  });

  it("skips a metric that already has a reading today, manual or automatic; yesterday does not count", () => {
    const existing = [
      { metric: "instagram_followers", measured_on: TODAY },
      { metric: "facebook_followers", measured_on: "2026-10-15" },
    ];
    assert.deepEqual(readingsToInsert(results, existing, TODAY).map((r) => r.metric), ["facebook_followers"]);
  });

  it("plan: inserts when the day is empty, refreshes today's automatic reading, keeps a manual one", () => {
    const reads = [
      { metric: "facebook_followers", ok: true, value: 1892 },
      { metric: "instagram_followers", ok: true, value: 41 },
      { metric: "tiktok_followers", ok: true, value: 3447 },
    ];
    const existing = [
      { id: "fb-auto", metric: "facebook_followers", measured_on: TODAY, source: "automatique", value: 1890 },
      { id: "tt-manual", metric: "tiktok_followers", measured_on: TODAY, source: "manuel", value: 583 },
      { id: "ig-old", metric: "instagram_followers", measured_on: "2026-10-15", source: "automatique", value: 30 },
    ];
    const plan = planFollowerReadings(reads, existing, TODAY);
    assert.deepEqual(plan.inserts, [{ metric: "instagram_followers", value: 41, measured_on: TODAY, source: "automatique" }]);
    assert.deepEqual(plan.updates, [{ id: "fb-auto", metric: "facebook_followers", value: 1892 }]);
    assert.deepEqual(plan.keptManual, ["tiktok_followers"]);
  });

  it("plan: an unchanged automatic value, a failed read or a pre-093 row without source write nothing", () => {
    const existing = [
      { id: "fb-auto", metric: "facebook_followers", measured_on: TODAY, source: "automatique", value: 1892 },
      { id: "ig-legacy", metric: "instagram_followers", measured_on: TODAY, source: null, value: 40 },
    ];
    const plan = planFollowerReadings(
      [
        { metric: "facebook_followers", ok: true, value: 1892 },
        { metric: "instagram_followers", ok: true, value: 41 },
        { metric: "tiktok_followers", ok: false, error: "HTTP 500" },
      ],
      existing,
      TODAY,
    );
    assert.deepEqual(plan, { inserts: [], updates: [], keptManual: ["instagram_followers"] });
  });

  it("a failed read writes nothing", () => {
    assert.deepEqual(readingsToInsert([{ metric: "facebook_followers", ok: false, error: "HTTP 500" }], [], TODAY), []);
  });

  it("the cron is daily at 02:00 UTC and checks CRON_SECRET", () => {
    const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons;
    assert.ok(crons.some((c) => c.path === "/api/cron/social-followers" && c.schedule === "0 2 * * *"));
    const route = readFileSync("app/api/cron/social-followers/route.ts", "utf8");
    assert.match(route, /CRON_SECRET/);
    // Each platform skips on its own: no Meta token does not stop TikTok.
    assert.match(route, /meta = "no token"/);
    assert.match(route, /"not connected"/);
  });
});
