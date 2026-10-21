import test from "node:test";
import assert from "node:assert/strict";
import {
  GraphError,
  cadenceOf,
  errorKind,
  facebookFormat,
  followerTrend,
  frenchSocialError,
  isCacheable,
  mondayOf,
  parseFacebookPost,
  parseInsights,
  parseInstagramMedia,
  readFacebook,
  readInstagram,
  readInsights,
  readSocialSnapshot,
} from "./insights.ts";

// No test may reach the network.
globalThis.fetch = () => {
  throw new Error("real network call in a test");
};

const NOW = new Date("2026-10-19T12:00:00Z");
const cfg = { graphVersion: "v25.0", pageId: "PAGE1", igUserId: "IG1", pageToken: "PAGE-TOKEN-SECRET", igToken: "SYS-TOKEN-SECRET" };

/** Fake Graph: handlers keyed by path (without version), each returns [status, body] or a body. */
function fakeGraph(handlers) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v\d+\.\d+\//, "");
    const params = Object.fromEntries(u.searchParams);
    calls.push({ path, params, init });
    assert.equal(init.method, "GET", "only GET calls are allowed");
    const handler = handlers[path];
    if (!handler) return { ok: false, status: 404, json: async () => ({ error: { code: 803, message: `unknown ${path}` } }) };
    const out = handler(params);
    const [status, body] = Array.isArray(out) ? out : [200, out];
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetch, calls };
}

const permissionError = [403, { error: { code: 10, message: "(#10) Application does not have permission for this action" } }];
const tokenError = [400, { error: { code: 190, message: "Error validating access token: Session has expired" } }];

test("parseInsights reads values, total_value and sums reaction objects", () => {
  const m = parseInsights({
    data: [
      { name: "reach", values: [{ value: 120 }] },
      { name: "views", total_value: { value: 300 } },
      { name: "reactions", values: [{ value: { like: 3, love: 2 } }] },
      { name: "bad", values: [{ value: "x" }] },
    ],
  });
  assert.deepEqual(m, { reach: 120, views: 300, reactions: 5 });
  assert.deepEqual(parseInsights(null), {});
});

test("Facebook posts: counts from summaries, reels detected from the permalink", () => {
  const post = parseFacebookPost({
    id: "PAGE1_1",
    message: "Une   villa\n à Zagtouli",
    created_time: "2026-10-16T17:22:29+0000",
    permalink_url: "https://www.facebook.com/reel/146/",
    reactions: { summary: { total_count: 7 } },
    comments: { summary: { total_count: 2 } },
    shares: { count: 1 },
    attachments: { data: [{ type: "video_inline", target: { id: "146" } }] },
  });
  assert.equal(post.format, "reel");
  assert.equal(post.caption, "Une villa à Zagtouli");
  assert.equal(post.likes, 7);
  assert.equal(post.interactions, 10);
  assert.equal(facebookFormat({ attachments: { data: [{ type: "photo" }] } }), "photo");
  assert.equal(facebookFormat({}), "texte");
});

test("Instagram media: format and thumbnail", () => {
  const reel = parseInstagramMedia({ id: "1", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-17T17:10:40+0000", thumbnail_url: "t.jpg", media_url: "v.mp4", like_count: 4, comments_count: 1 });
  assert.equal(reel.format, "reel");
  assert.equal(reel.thumbnail, "t.jpg");
  const photo = parseInstagramMedia({ id: "2", media_type: "IMAGE", media_product_type: "FEED", timestamp: "2026-10-17T17:10:40+0000", media_url: "p.jpg" });
  assert.equal(photo.thumbnail, "p.jpg");
  assert.equal(parseInstagramMedia({ id: "3" }), null);
});

test("cadence: weeks start on Monday, gaps and averages", () => {
  assert.equal(mondayOf(new Date("2026-10-19T08:00:00Z")), "2026-10-19");
  assert.equal(mondayOf(new Date("2026-10-18T08:00:00Z")), "2026-10-12");
  const c = cadenceOf(["2026-10-17T10:00:00Z", "2026-10-16T10:00:00Z", "2026-09-30T10:00:00Z", "2026-08-01T10:00:00Z"], NOW);
  assert.equal(c.last7, 2);
  assert.equal(c.last30, 3);
  assert.equal(c.daysSinceLast, 2);
  assert.equal(c.weeks.length, 8);
  assert.equal(c.weeks.at(-1).weekStart, "2026-10-19");
  assert.equal(c.weeks.at(-2).count, 2);
  assert.equal(c.perWeek, 0.6);
  assert.equal(cadenceOf([], NOW).daysSinceLast, null);
});

test("errors are classified and written in French without the token", () => {
  assert.equal(errorKind(new GraphError(190, null, 400, "expired")), "token");
  assert.equal(errorKind(new GraphError(10, null, 403, "no perm")), "permission");
  assert.equal(errorKind(new GraphError(200, null, 403, "no perm")), "permission");
  assert.equal(errorKind(new GraphError(4, null, 400, "limit")), "limit");
  assert.equal(errorKind(new GraphError(100, null, 400, "The value must be a valid insights metric")), "unknown_metric");
  assert.equal(errorKind(new Error("boom")), "network");
  const msg = frenchSocialError(new GraphError(10, null, 403, "x"), "instagram", "statistiques");
  assert.match(msg, /instagram_manage_insights/);
  assert.match(frenchSocialError(new GraphError(10, null, 403, "x"), "facebook", "publications"), /pages_read_engagement/);
  assert.match(frenchSocialError(new GraphError(190, null, 400, "x"), "facebook", "compte"), /expiré/);
  const other = frenchSocialError(new GraphError(99, null, 400, "bad https://graph.facebook.com/x?access_token=SECRET"), "facebook", "compte");
  assert.doesNotMatch(other, /SECRET|https:/);
  for (const text of [msg, other]) assert.doesNotMatch(text, /—/, "no em dash in UI strings");
});

test("readInsights retries an unknown metric alone and remembers it", async () => {
  const { fetch, calls } = fakeGraph({
    "M1/insights": (p) => {
      if (p.metric.split(",").includes("old_metric")) return [400, { error: { code: 100, message: "(#100) The value must be a valid insights metric" } }];
      return { data: [{ name: p.metric, values: [{ value: 5 }] }] };
    },
  });
  const refused = new Set();
  const m = await readInsights({ fetch }, "v25.0", "T", "M1/insights", ["reach", "old_metric"], refused);
  assert.deepEqual(m, { reach: 5 });
  assert.deepEqual([...refused], ["old_metric"]);
  const before = calls.length;
  await readInsights({ fetch }, "v25.0", "T", "M1/insights", ["reach", "old_metric"], refused);
  assert.equal(calls.length, before + 1, "the refused metric is not asked again");
});

function instagramHandlers(overrides = {}) {
  return {
    IG1: () => ({ username: "roogo.burkina", name: "Roogo Burkina", followers_count: 12 }),
    "IG1/media": () => ({
      data: [
        { id: "m1", media_type: "IMAGE", media_product_type: "FEED", timestamp: "2026-10-17T17:10:40+0000", like_count: 3, comments_count: 1, media_url: "a.jpg", permalink: "https://instagram.com/p/1" },
        { id: "m2", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-07-23T20:22:21+0000", like_count: 0, comments_count: 0, thumbnail_url: "b.jpg" },
      ],
    }),
    "m1/insights": () => ({
      data: [
        { name: "reach", values: [{ value: 200 }] },
        { name: "views", values: [{ value: 340 }] },
        { name: "likes", values: [{ value: 3 }] },
        { name: "comments", values: [{ value: 1 }] },
        { name: "shares", values: [{ value: 2 }] },
        { name: "saved", values: [{ value: 4 }] },
        { name: "total_interactions", values: [{ value: 10 }] },
      ],
    }),
    "m2/insights": () => ({ data: [{ name: "reach", values: [{ value: 50 }] }] }),
    "IG1/insights": () => ({ data: [{ name: "reach", total_value: { value: 900 } }, { name: "views", total_value: { value: 2000 } }, { name: "total_interactions", total_value: { value: 40 } }] }),
    ...overrides,
  };
}

test("Instagram: followers, posts with insights, engagement rate and 28-day totals", async () => {
  const { fetch, calls } = fakeGraph(instagramHandlers());
  const acc = await readInstagram({ fetch, now: () => NOW }, cfg);
  assert.equal(acc.ok, true);
  assert.equal(acc.followers, 12);
  assert.equal(acc.handle, "roogo.burkina");
  assert.equal(acc.posts[0].reach, 200);
  assert.equal(acc.posts[0].saves, 4);
  assert.equal(acc.posts[0].engagementRate, 0.05);
  assert.deepEqual(acc.totals, { reach: 900, views: 2000, interactions: 40 });
  assert.equal(acc.insightsAvailable, true);
  assert.deepEqual(acc.warnings, []);
  for (const c of calls) {
    assert.equal(c.params.access_token, undefined, "token never in the URL");
    assert.equal(c.init.headers.Authorization, "Bearer SYS-TOKEN-SECRET");
  }
});

test("Instagram without instagram_manage_insights: posts and likes stay, one French warning", async () => {
  const { fetch } = fakeGraph(instagramHandlers({ "m1/insights": () => permissionError, "m2/insights": () => permissionError, "IG1/insights": () => permissionError }));
  const logs = [];
  const acc = await readInstagram({ fetch, now: () => NOW }, cfg, (m, d) => logs.push([m, d]));
  assert.equal(acc.ok, true);
  assert.equal(acc.posts.length, 2);
  assert.equal(acc.posts[0].likes, 3);
  assert.equal(acc.posts[0].reach, null);
  assert.equal(acc.insightsAvailable, false);
  assert.equal(acc.warnings.length, 1);
  assert.match(acc.warnings[0], /instagram_manage_insights/);
  assert.ok(logs.some(([m, d]) => m.includes("insights") && d.code === 10));
  assert.doesNotMatch(JSON.stringify(logs), /SECRET/);
});

test("expired token: the account shows a French error, nothing cached", async () => {
  const { fetch } = fakeGraph({ IG1: () => tokenError, PAGE1: () => tokenError });
  const snap = await readSocialSnapshot({ fetch, now: () => NOW }, cfg, []);
  assert.equal(snap.instagram.ok, false);
  assert.match(snap.instagram.error, /jeton Meta a expiré/);
  assert.match(snap.facebook.error, /jeton Meta a expiré/);
  assert.equal(isCacheable(snap), false);
});

test("not configured: no call, a French message naming the env variables", async () => {
  const { fetch, calls } = fakeGraph({});
  const snap = await readSocialSnapshot({ fetch, now: () => NOW }, { ...cfg, pageId: "", igUserId: "" }, ["META_PAGE_ID", "META_IG_ACCOUNT_ID"]);
  assert.equal(calls.length, 0);
  assert.match(snap.facebook.error, /META_PAGE_ID/);
  assert.match(snap.instagram.error, /META_IG_ACCOUNT_ID/);
});

test("Facebook: page, posts, reel insights via video_insights, photo via post insights", async () => {
  const { fetch, calls } = fakeGraph({
    PAGE1: () => ({ name: "Roogo Burkina", followers_count: 1874 }),
    "PAGE1/published_posts": () => ({
      data: [
        {
          id: "PAGE1_1",
          message: "Reel",
          created_time: "2026-10-17T18:14:18+0000",
          permalink_url: "https://www.facebook.com/reel/V1/",
          attachments: { data: [{ type: "video_inline", target: { id: "V1" } }] },
          reactions: { summary: { total_count: 9 } },
          comments: { summary: { total_count: 3 } },
          shares: { count: 2 },
        },
        {
          id: "PAGE1_2",
          message: "Photo",
          created_time: "2026-10-10T10:00:00+0000",
          permalink_url: "https://www.facebook.com/p/2",
          attachments: { data: [{ type: "photo" }] },
          reactions: { summary: { total_count: 1 } },
          comments: { summary: { total_count: 0 } },
        },
      ],
    }),
    "V1/video_insights": () => ({ data: [{ name: "post_impressions_unique", values: [{ value: 700 }] }, { name: "blue_reels_play_count", values: [{ value: 1500 }] }] }),
    "PAGE1_2/insights": () => ({ data: [{ name: "post_total_media_view_unique", values: [{ value: 100 }] }, { name: "post_media_view", values: [{ value: 130 }] }] }),
    "PAGE1/insights": (p) => {
      assert.equal(p.period, "days_28");
      return { data: [{ name: "page_total_media_view_unique", values: [{ value: 5000 }] }, { name: "page_post_engagements", values: [{ value: 80 }] }] };
    },
  });
  const acc = await readFacebook({ fetch, now: () => NOW }, cfg);
  assert.equal(acc.followers, 1874);
  assert.equal(acc.posts[0].reach, 700);
  assert.equal(acc.posts[0].views, 1500);
  assert.equal(acc.posts[0].interactions, 14);
  assert.equal(acc.posts[0].engagementRate, 0.02);
  assert.equal(acc.posts[1].reach, 100);
  assert.equal(acc.posts[1].shares, 0);
  assert.deepEqual(acc.totals, { reach: 5000, views: null, interactions: 80 });
  assert.equal(acc.cadence.last30, 2);
  assert.ok(!calls.some((c) => c.path === "PAGE1_1/insights"), "reel reach came from video_insights");
  assert.ok(calls.every((c) => c.init.headers.Authorization === "Bearer PAGE-TOKEN-SECRET"));
});

test("Facebook without read_insights: posts listed, warning names the permission", async () => {
  const { fetch } = fakeGraph({
    PAGE1: () => ({ name: "Roogo Burkina", followers_count: 1874 }),
    "PAGE1/published_posts": () => ({ data: [{ id: "PAGE1_2", created_time: "2026-10-10T10:00:00+0000", attachments: { data: [{ type: "photo" }] } }] }),
    "PAGE1_2/insights": () => permissionError,
    "PAGE1/insights": () => permissionError,
  });
  const acc = await readFacebook({ fetch, now: () => NOW }, cfg);
  assert.equal(acc.ok, true);
  assert.equal(acc.posts.length, 1);
  assert.equal(acc.insightsAvailable, false);
  assert.match(acc.warnings.join(" "), /read_insights/);
});

test("followerTrend: one point per day and the change over 30 days", () => {
  const t = followerTrend(
    [
      { measured_on: "2026-09-10", value: 1700 },
      { measured_on: "2026-09-18", value: 1750 },
      { measured_on: "2026-10-18", value: 1870 },
      { measured_on: "2026-10-18", value: 1860 },
    ],
    1874,
    NOW,
  );
  assert.equal(t.points.length, 3);
  assert.equal(t.points[2].value, 1870);
  assert.equal(t.since, "2026-09-18");
  assert.equal(t.delta, 124);
  assert.deepEqual(followerTrend([], 10, NOW), { points: [], delta: null, since: null });
});
