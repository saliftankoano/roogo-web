// The YouTube card of Studio > Statistiques (lib/social/insights.ts), with a fake fetch.
import assert from "node:assert/strict";
import test from "node:test";
import {
  YOUTUBE_NOT_CONNECTED,
  followerReadingsOf,
  isCacheable,
  isoDurationSeconds,
  parseYouTubeVideo,
  readSocialSnapshot,
  readYouTube,
} from "./insights.ts";

const NOW = new Date("2026-10-23T12:00:00Z");
const ACCESS = { ok: true, token: "ya29.YOUTUBE-SECRET", scope: "https://www.googleapis.com/auth/youtube.readonly" };
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const CHANNEL = {
  items: [
    {
      id: "UC123",
      snippet: { title: "Roogo Burkina", customUrl: "@roogoburkina" },
      statistics: { subscriberCount: "41", hiddenSubscriberCount: false, videoCount: "6", viewCount: "5300" },
      contentDetails: { relatedPlaylists: { uploads: "UU123" } },
    },
  ],
};

function video(id, ageDays, duration, views) {
  return {
    id,
    snippet: { title: `Villa ${id} à Balkuy`, publishedAt: daysAgo(ageDays), thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
    statistics: { viewCount: String(views), likeCount: "3", commentCount: "1" },
    contentDetails: { duration },
  };
}

const VIDEOS = [video("a", 2, "PT45S", 300), video("b", 10, "PT2M59S", 200), video("c", 20, "PT12M", 1000), video("d", 40, "PT30S", 50)];

function fakeYouTube({ channel = CHANNEL, playlist, videos = VIDEOS, channelError, listError } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.replace("/youtube/v3/", "");
    const params = Object.fromEntries(u.searchParams);
    calls.push({ path, params, init });
    assert.equal(init.method, "GET", "only GET calls");
    assert.equal(init.headers.Authorization, `Bearer ${ACCESS.token}`);
    assert.ok(!url.includes("SECRET"), "token never in the URL");
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (path === "channels") return channelError ? reply(...channelError) : reply(200, channel);
    if (path === "playlistItems") {
      if (listError) return reply(...listError);
      const items = (playlist ?? videos.map((v) => ({ contentDetails: { videoId: v.id, videoPublishedAt: v.snippet.publishedAt } })));
      return reply(200, { items });
    }
    if (path === "videos") {
      const ids = params.id.split(",");
      return reply(200, { items: videos.filter((v) => ids.includes(v.id)) });
    }
    return reply(404, { error: { code: 404, message: "unknown" } });
  };
  return { fetch, calls };
}

test("ISO 8601 durations", () => {
  assert.equal(isoDurationSeconds("PT45S"), 45);
  assert.equal(isoDurationSeconds("PT2M59S"), 179);
  assert.equal(isoDurationSeconds("PT1H2M3S"), 3723);
  assert.equal(isoDurationSeconds("P1DT1S"), 86401);
  assert.equal(isoDurationSeconds("PT"), null);
  assert.equal(isoDurationSeconds("nope"), null);
  assert.equal(isoDurationSeconds(undefined), null);
});

test("a video of 3 minutes or less is a Short with its Shorts link; longer is a video", () => {
  const short = parseYouTubeVideo(video("a", 1, "PT3M", 10));
  assert.equal(short.format, "short");
  assert.equal(short.permalink, "https://www.youtube.com/shorts/a");
  assert.equal(short.views, 10);
  assert.equal(short.interactions, 4);
  assert.equal(short.reach, null);
  assert.equal(short.network, "youtube");
  const long = parseYouTubeVideo(video("c", 1, "PT3M1S", 10));
  assert.equal(long.format, "video");
  assert.equal(long.permalink, "https://www.youtube.com/watch?v=c");
  assert.equal(parseYouTubeVideo({ id: "x", snippet: {} }), null);
});

test("readYouTube: subscribers, videos, total views, 28-day views, rhythm and the latest Shorts", async () => {
  const yt = fakeYouTube();
  const acc = await readYouTube({ fetch: yt.fetch, now: () => NOW }, ACCESS);
  assert.equal(acc.ok, true);
  assert.equal(acc.name, "Roogo Burkina");
  assert.equal(acc.handle, "roogoburkina");
  assert.equal(acc.followers, 41);
  assert.deepEqual(acc.profileTotals, { likes: null, videos: 6, views: 5300 });
  // 28 days: a (300), b (200), c (1000); d is 40 days old.
  assert.equal(acc.totals.views, 1500);
  assert.equal(acc.postCount, 4);
  assert.deepEqual(acc.posts.map((p) => p.id), ["a", "b", "d"], "only Shorts, newest first");
  assert.equal(acc.cadence.last30, 3);
  assert.equal(acc.cadence.weeks.length, 8);
  assert.deepEqual(yt.calls.map((c) => c.path), ["channels", "playlistItems", "videos"]);
  assert.equal(yt.calls[0].params.mine, "true");
  assert.equal(yt.calls[1].params.playlistId, "UU123");
});

test("readYouTube: not connected is calm; a token error is the card's error", async () => {
  const off = await readYouTube({ fetch: async () => assert.fail("no call"), now: () => NOW }, { ok: false, error: "x", notConnected: true });
  assert.equal(off.notConnected, true);
  assert.equal(off.error, YOUTUBE_NOT_CONNECTED);
  const yt = fakeYouTube({ channelError: [401, { error: { code: 401, message: "Invalid Credentials", errors: [{ reason: "authError" }] } }] });
  const acc = await readYouTube({ fetch: yt.fetch, now: () => NOW }, ACCESS);
  assert.equal(acc.ok, false);
  assert.match(acc.error, /reconnecte YouTube/);
  assert.ok(!acc.error.includes("SECRET"));
});

test("readYouTube: a failed video list keeps the subscribers and warns (quota)", async () => {
  const yt = fakeYouTube({ listError: [403, { error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }] });
  const acc = await readYouTube({ fetch: yt.fetch, now: () => NOW }, ACCESS);
  assert.equal(acc.ok, true);
  assert.equal(acc.followers, 41);
  assert.equal(acc.totals, null);
  assert.match(acc.warnings[0], /quota YouTube/);
});

test("readYouTube: a hidden subscriber count reads as « – » with a note; no channel is named", async () => {
  const hidden = structuredClone(CHANNEL);
  hidden.items[0].statistics.hiddenSubscriberCount = true;
  const acc = await readYouTube({ fetch: fakeYouTube({ channel: hidden }).fetch, now: () => NOW }, ACCESS);
  assert.equal(acc.followers, null);
  assert.match(acc.warnings.join(" "), /cache son nombre/);
  const none = await readYouTube({ fetch: fakeYouTube({ channel: { items: [] } }).fetch, now: () => NOW }, ACCESS);
  assert.equal(none.ok, false);
  assert.match(none.error, /pas de chaîne YouTube/);
});

test("the snapshot: a YouTube crash never blanks the others, and YouTube alone is worth caching", async () => {
  const cfg = { graphVersion: "v25.0", pageId: "", igUserId: "", pageToken: "", igToken: "" };
  const metaFetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 190, message: "expired" } }) });
  const crash = { access: async () => { throw new Error("db down"); }, fetch: async () => assert.fail() };
  const snap = await readSocialSnapshot({ fetch: metaFetch, now: () => NOW }, cfg, [], () => {}, undefined, crash);
  assert.equal(snap.youtube.ok, false);
  assert.match(snap.youtube.error, /YouTube ne peut pas être lu/);
  assert.equal(snap.tiktok.notConnected, true);

  const yt = fakeYouTube();
  const live = await readSocialSnapshot({ fetch: metaFetch, now: () => NOW }, cfg, [], () => {}, undefined, { access: async () => ACCESS, fetch: yt.fetch });
  assert.equal(live.youtube.ok, true);
  assert.equal(isCacheable(live), true);
  assert.deepEqual(followerReadingsOf(live), [{ metric: "youtube_subscribers", ok: true, value: 41 }]);

  const missing = await readSocialSnapshot({ fetch: metaFetch, now: () => NOW }, cfg, []);
  assert.equal(missing.youtube.notConnected, true);
  assert.equal(missing.youtube.error, YOUTUBE_NOT_CONNECTED);
});
