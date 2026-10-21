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
  TIKTOK_NOT_CONNECTED,
  facebookVideoOwners,
  parseTikTokVideo,
  plausibleReach,
  readTikTok,
  recentViews,
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

// --- Facebook reach and shared videos (production bug, 2026-10-21) -----------
//
// Evidence from the live Page (published_posts, read 2026-10-21): the 30 Sept
// post 1046356035218080_122138520153238893 (permalink /posts/...) and the
// 28 Sept reel 1046356035218080_122138174637238893 both carry
// attachments[0].target.id = 29137348945858130. video_insights counts the
// video, not the post, so both rows showed the same 9 533 plays. A reach of 0
// next to views or likes is not a measure and is shown as « – ».

const SHARED_VIDEO = "29137348945858130";
function sharedVideoPosts() {
  return [
    {
      id: "PAGE1_reshare",
      message: "Partage",
      created_time: "2026-09-30T20:46:47+0000",
      permalink_url: "https://www.facebook.com/122129785173238893/posts/122138520153238893",
      attachments: { data: [{ type: "video_inline", target: { id: SHARED_VIDEO } }] },
      reactions: { summary: { total_count: 2 } },
      comments: { summary: { total_count: 0 } },
    },
    {
      id: "PAGE1_reel",
      message: "Reel",
      created_time: "2026-09-28T14:18:24+0000",
      permalink_url: `https://www.facebook.com/reel/${SHARED_VIDEO}/`,
      attachments: { data: [{ type: "video_inline", target: { id: SHARED_VIDEO } }] },
      reactions: { summary: { total_count: 12 } },
      comments: { summary: { total_count: 1 } },
    },
  ];
}

test("Facebook: a re-shared video keeps its plays on the original post only", async () => {
  const { fetch, calls } = fakeGraph({
    PAGE1: () => ({ name: "Roogo Burkina", followers_count: 1874 }),
    "PAGE1/published_posts": () => ({ data: sharedVideoPosts() }),
    [`${SHARED_VIDEO}/video_insights`]: () => ({
      data: [
        { name: "post_impressions_unique", values: [{ value: 0 }] },
        { name: "blue_reels_play_count", values: [{ value: 9533 }] },
      ],
    }),
    "PAGE1_reel/insights": () => ({ data: [{ name: "post_total_media_view_unique", values: [{ value: 6100 }] }] }),
    "PAGE1_reshare/insights": () => ({
      data: [
        { name: "post_total_media_view_unique", values: [{ value: 40 }] },
        { name: "post_media_view", values: [{ value: 55 }] },
      ],
    }),
    "PAGE1/insights": () => ({ data: [] }),
  });
  const acc = await readFacebook({ fetch, now: () => NOW }, cfg);
  const reel = acc.posts.find((p) => p.id === "PAGE1_reel");
  const reshare = acc.posts.find((p) => p.id === "PAGE1_reshare");
  assert.equal(reel.views, 9533);
  assert.equal(reel.reach, 6100, "a 0 from video_insights falls back to the post reach");
  assert.equal(reshare.views, 55, "the re-share shows its own views, not the video's 9 533");
  assert.equal(reshare.reach, 40);
  assert.equal(calls.filter((c) => c.path === `${SHARED_VIDEO}/video_insights`).length, 1);
});

test("Facebook: reach 0 next to views or interactions is shown as « – » (null)", async () => {
  assert.equal(plausibleReach(0, 120, 3), null);
  assert.equal(plausibleReach(0, null, 4), null);
  assert.equal(plausibleReach(0, 0, 0), 0);
  assert.equal(plausibleReach(null, 10, 1), null);
  assert.equal(plausibleReach(80, 120, 3), 80);
  const { fetch } = fakeGraph({
    PAGE1: () => ({ name: "Roogo Burkina", followers_count: 1874 }),
    "PAGE1/published_posts": () => ({ data: sharedVideoPosts().slice(1) }),
    [`${SHARED_VIDEO}/video_insights`]: () => ({
      data: [
        { name: "post_impressions_unique", values: [{ value: 0 }] },
        { name: "blue_reels_play_count", values: [{ value: 300 }] },
      ],
    }),
    "PAGE1_reel/insights": () => ({ data: [{ name: "post_total_media_view_unique", values: [{ value: 0 }] }] }),
    "PAGE1/insights": () => ({ data: [] }),
  });
  const acc = await readFacebook({ fetch, now: () => NOW }, cfg);
  assert.equal(acc.posts[0].views, 300);
  assert.equal(acc.posts[0].reach, null);
  assert.equal(acc.posts[0].engagementRate, null);
});

test("facebookVideoOwners: the oldest post owns the video", () => {
  const owners = facebookVideoOwners(sharedVideoPosts().map((raw) => ({ id: raw.id, createdAt: new Date(raw.created_time).toISOString(), raw })));
  assert.equal(owners.get(SHARED_VIDEO), "PAGE1_reel");
});

// --- TikTok -------------------------------------------------------------------

/** Fake TikTok Display API: records calls, serves user/info and paged video/list. */
function fakeTikTok({ user, pages = [], userError, listError } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, fields: u.searchParams.get("fields"), init, body: init.body ? JSON.parse(init.body) : null });
    if (u.pathname === "/v2/user/info/") {
      assert.equal(init.method, "GET");
      if (userError) return { ok: false, status: userError[0], json: async () => userError[1] };
      return { ok: true, status: 200, json: async () => ({ data: { user }, error: { code: "ok", message: "", log_id: "L1" } }) };
    }
    if (u.pathname === "/v2/video/list/") {
      assert.equal(init.method, "POST");
      if (listError) return { ok: false, status: listError[0], json: async () => listError[1] };
      const cursor = JSON.parse(init.body).cursor;
      const page = cursor === undefined ? pages[0] : pages.find((p) => p.after === cursor);
      const body = page ?? { videos: [], has_more: false, cursor: 0 };
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { videos: body.videos, cursor: body.cursor, has_more: body.has_more }, error: { code: "ok" } }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, calls };
}

const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const TT_USER = { open_id: "o1", display_name: "Roogo", follower_count: 340, following_count: 3, likes_count: 2100, video_count: 25 };
const TT_ACCESS = { ok: true, token: "act.TIKTOK-SECRET", scope: "user.info.basic,user.info.stats,video.list" };

test("parseTikTokVideo: counts, date in seconds, title first, no reach or saves", () => {
  const p = parseTikTokVideo({
    id: "7",
    title: "Villa  à Ouaga",
    video_description: "desc",
    create_time: ts("2026-10-18T10:00:00Z"),
    view_count: 900,
    like_count: 30,
    comment_count: 2,
    share_count: 1,
    cover_image_url: "c.jpg",
    share_url: "https://www.tiktok.com/@roogo.226/video/7",
  });
  assert.equal(p.network, "tiktok");
  assert.equal(p.createdAt, "2026-10-18T10:00:00.000Z");
  assert.equal(p.caption, "Villa à Ouaga");
  assert.equal(p.views, 900);
  assert.equal(p.interactions, 33);
  assert.equal(p.reach, null);
  assert.equal(p.saves, null);
  assert.equal(p.engagementRate, null);
  assert.equal(parseTikTokVideo({ id: "x" }), null);
  const bare = parseTikTokVideo({ id: "8", create_time: ts("2026-10-18T10:00:00Z"), video_description: "d" });
  assert.equal(bare.permalink, "https://www.tiktok.com/@roogo.226/video/8");
  assert.equal(bare.caption, "d");
});

test("TikTok: profile totals, paged video list, 8-week rhythm and 28-day views", async () => {
  const page1 = [
    { id: "v1", title: "Un", create_time: ts("2026-10-18T10:00:00Z"), view_count: 500, like_count: 10, comment_count: 1, share_count: 0 },
    { id: "v2", title: "Deux", create_time: ts("2026-10-13T10:00:00Z"), view_count: 300, like_count: 5, comment_count: 0, share_count: 1 },
  ];
  const page2 = [
    { id: "v3", title: "Trois", create_time: ts("2026-09-25T10:00:00Z"), view_count: 1000, like_count: 40, comment_count: 3, share_count: 2 },
    { id: "v4", title: "Quatre", create_time: ts("2026-09-01T10:00:00Z"), view_count: 50, like_count: 1, comment_count: 0, share_count: 0 },
  ];
  const { fetch, calls } = fakeTikTok({
    user: TT_USER,
    pages: [
      { videos: page1, has_more: true, cursor: 1760000000000 },
      { after: 1760000000000, videos: page2, has_more: false, cursor: 1750000000000 },
    ],
  });
  const acc = await readTikTok({ fetch, now: () => NOW }, TT_ACCESS);
  assert.equal(acc.ok, true);
  assert.equal(acc.followers, 340);
  assert.equal(acc.handle, "roogo.226");
  assert.equal(acc.name, "Roogo");
  assert.deepEqual(acc.profileTotals, { likes: 2100, videos: 25 });
  assert.equal(acc.postCount, 4);
  assert.equal(acc.posts[0].id, "v1");
  // 28 days before 2026-10-19T12:00Z is 2026-09-21T12:00Z: v1 + v2 + v3.
  assert.deepEqual(acc.totals, { reach: null, views: 1800, interactions: null });
  assert.equal(acc.cadence.weeks.length, 8);
  assert.equal(acc.cadence.weeks.at(-1).weekStart, "2026-10-19");
  assert.equal(acc.cadence.weeks.at(-2).weekStart, "2026-10-12");
  assert.equal(acc.cadence.weeks.at(-2).count, 2, "13 Oct and 18 Oct fall in the week of Monday 12 Oct");
  assert.equal(acc.cadence.last30, 3);
  assert.equal(acc.cadence.lastPostAt, "2026-10-18T10:00:00.000Z");
  assert.equal(acc.insightsAvailable, true);
  assert.deepEqual(acc.warnings, []);
  const lists = calls.filter((c) => c.path === "/v2/video/list/");
  assert.equal(lists.length, 2);
  assert.deepEqual(lists[0].body, { max_count: 20 });
  assert.deepEqual(lists[1].body, { max_count: 20, cursor: 1760000000000 });
  assert.match(calls[0].fields, /follower_count/);
  assert.match(calls[0].fields, /likes_count/);
  assert.match(lists[0].fields, /view_count/);
  for (const c of calls) {
    assert.equal(c.init.headers.Authorization, "Bearer act.TIKTOK-SECRET");
    assert.ok(!String(c.fields).includes("SECRET"), "token never in the URL");
  }
});

test("TikTok: video list stops at 60 videos (3 pages of 20)", async () => {
  const mk = (n, base) =>
    Array.from({ length: 20 }, (_, i) => ({ id: `p${n}-${i}`, create_time: ts("2026-10-18T10:00:00Z") - (base + i) * 3600, view_count: 1 }));
  const { fetch, calls } = fakeTikTok({
    user: TT_USER,
    pages: [
      { videos: mk(1, 0), has_more: true, cursor: 3 },
      { after: 3, videos: mk(2, 20), has_more: true, cursor: 2 },
      { after: 2, videos: mk(3, 40), has_more: true, cursor: 1 },
      { after: 1, videos: mk(4, 60), has_more: false, cursor: 0 },
    ],
  });
  const acc = await readTikTok({ fetch, now: () => NOW }, TT_ACCESS);
  assert.equal(calls.filter((c) => c.path === "/v2/video/list/").length, 3);
  assert.equal(acc.postCount, 60);
  assert.equal(acc.posts.length, 12);
});

test("TikTok rhythm: weeks run Monday to Sunday; recentViews edge cases", () => {
  // Sunday 18 Oct 23:00 UTC belongs to the week of Monday 12 Oct; Monday 19 Oct 00:30 to the next one.
  const c = cadenceOf(["2026-10-18T23:00:00Z", "2026-10-19T00:30:00Z"], NOW);
  assert.equal(c.weeks.at(-1).count, 1);
  assert.equal(c.weeks.at(-2).count, 1);
  assert.equal(recentViews([], NOW), 0);
  assert.equal(recentViews([{ createdAt: "2026-10-18T00:00:00Z", views: null }], NOW), null);
});

test("TikTok not connected: calm French state, no call", async () => {
  const { fetch, calls } = fakeTikTok({ user: TT_USER });
  const acc = await readTikTok({ fetch, now: () => NOW }, { ok: false, error: "Le compte TikTok n'est pas connecté.", notConnected: true });
  assert.equal(calls.length, 0);
  assert.equal(acc.ok, false);
  assert.equal(acc.notConnected, true);
  assert.equal(acc.error, TIKTOK_NOT_CONNECTED);
  assert.equal(acc.error, "TikTok n'est pas encore connecté. Le fondateur le connecte depuis Statistiques.");
  assert.doesNotMatch(acc.error, /—/);
});

test("TikTok expired token: French error naming the reconnection, token never logged", async () => {
  const { fetch } = fakeTikTok({
    userError: [401, { data: {}, error: { code: "access_token_invalid", message: "The access token is invalid or not found in the request.", log_id: "L2" } }],
  });
  const logs = [];
  const acc = await readTikTok({ fetch, now: () => NOW }, TT_ACCESS, (m, d) => logs.push([m, d]));
  assert.equal(acc.ok, false);
  assert.equal(acc.notConnected, false);
  assert.match(acc.error, /reconnecte TikTok/);
  assert.doesNotMatch(acc.error, /—/);
  assert.doesNotMatch(JSON.stringify(logs), /SECRET/);
  assert.ok(logs.some(([, d]) => d.code === "access_token_invalid"));
});

test("TikTok without video.list: followers stay, one French warning", async () => {
  const { fetch } = fakeTikTok({ user: TT_USER, listError: [403, { error: { code: "scope_not_authorized", message: "scope", log_id: "L3" } }] });
  const acc = await readTikTok({ fetch, now: () => NOW }, TT_ACCESS);
  assert.equal(acc.ok, true);
  assert.equal(acc.followers, 340);
  assert.equal(acc.posts.length, 0);
  assert.equal(acc.totals, null);
  assert.equal(acc.warnings.length, 1);
  assert.match(acc.warnings[0], /video\.list/);
});

test("snapshot: a TikTok failure never breaks Meta, and a Meta failure never breaks TikTok", async () => {
  const meta = fakeGraph(instagramHandlers({ PAGE1: () => tokenError }));
  const crash = {
    access: async () => {
      throw new Error("relation social_tokens: boom");
    },
    fetch: async () => {
      throw new Error("unused");
    },
  };
  const snap = await readSocialSnapshot({ fetch: meta.fetch, now: () => NOW }, cfg, [], () => {}, crash);
  assert.equal(snap.instagram.ok, true);
  assert.equal(snap.tiktok.ok, false);
  assert.match(snap.tiktok.error, /TikTok ne peut pas être lu/);
  assert.equal(isCacheable(snap), true);

  const noMeta = fakeGraph({ IG1: () => tokenError, PAGE1: () => tokenError });
  const tt = fakeTikTok({ user: TT_USER, pages: [{ videos: [], has_more: false, cursor: 0 }] });
  const snap2 = await readSocialSnapshot({ fetch: noMeta.fetch, now: () => NOW }, cfg, [], () => {}, { access: async () => TT_ACCESS, fetch: tt.fetch });
  assert.equal(snap2.facebook.ok, false);
  assert.equal(snap2.instagram.ok, false);
  assert.equal(snap2.tiktok.ok, true);
  assert.equal(snap2.tiktok.followers, 340);
  assert.equal(isCacheable(snap2), true, "a TikTok-only read is still worth caching");

  const snap3 = await readSocialSnapshot({ fetch: noMeta.fetch, now: () => NOW }, cfg, []);
  assert.equal(snap3.tiktok.notConnected, true, "no TikTok source reads as not connected");
  assert.equal(isCacheable(snap3), false);
});
