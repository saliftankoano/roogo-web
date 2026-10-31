import test from "node:test";
import assert from "node:assert/strict";
import {
  CHUNK_SIZE,
  SINGLE_CHUNK_MAX,
  TIKTOK_PRIVATE_NOTE,
  TikTokApiError,
  chunkPlan,
  frenchTikTokError,
  hasScope,
  publishTikTok,
  pullUrlAllowed,
  tiktokPostMode,
  tiktokPublishInfo,
} from "./tiktok-publish.ts";

globalThis.fetch = () => {
  throw new Error("real network call in a test");
};

function fakeTikTok(statuses, { initError } = {}) {
  const calls = [];
  let poll = 0;
  const fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ host: u.host, path: u.pathname, method: init.method, headers: init.headers, body: init.body });
    if (u.host === "upload.tiktok.example") return { ok: true, status: 201, json: async () => ({}) };
    if (u.pathname.endsWith("/video/init/")) {
      if (initError) return { ok: false, status: 401, json: async () => ({ error: { code: initError, message: "no" } }) };
      return { ok: true, status: 200, json: async () => ({ data: { publish_id: "v_pub_1", upload_url: "https://upload.tiktok.example/up?x=1" }, error: { code: "ok" } }) };
    }
    if (u.pathname === "/v2/post/publish/status/fetch/") {
      const status = statuses[Math.min(poll++, statuses.length - 1)];
      return { ok: true, status: 200, json: async () => ({ data: { status, fail_reason: status === "FAILED" ? "file_format_check_failed" : undefined }, error: { code: "ok" } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, calls };
}

const deps = (fetch, size = 1000) => ({
  fetch,
  sleep: async () => {},
  video: { url: "https://www.roogobf.com/v.mp4", size: async () => size, readRange: async (a, b) => new Uint8Array(b - a + 1) },
  now: () => "2026-10-21T19:00:00.000Z",
  maxPolls: 3,
});

/** What the approval screen saves when Salif picks « Moi seulement » with everything off (postInfoFields). */
const PRIVATE_INFO = { privacy_level: "SELF_ONLY", disable_comment: true, disable_duet: true, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: false };

test("chunk plan: one chunk up to 10 MB, 10 MB chunks with the remainder in the last", () => {
  assert.deepEqual(chunkPlan(1000), { videoSize: 1000, chunkSize: 1000, totalChunkCount: 1, ranges: [{ start: 0, end: 999 }] });
  assert.equal(chunkPlan(SINGLE_CHUNK_MAX).totalChunkCount, 1);
  assert.equal(SINGLE_CHUNK_MAX, CHUNK_SIZE, "never a 64 MB chunk in memory");
  const big = chunkPlan(64 * 1024 * 1024 + 5);
  assert.equal(big.chunkSize, CHUNK_SIZE);
  assert.equal(big.totalChunkCount, Math.floor((64 * 1024 * 1024 + 5) / CHUNK_SIZE));
  assert.equal(big.ranges.at(-1).end, 64 * 1024 * 1024 + 4);
  assert.equal(big.ranges[1].start, CHUNK_SIZE);
  assert.throws(() => chunkPlan(0), /vide/);
});

test("mode and scope", () => {
  assert.equal(tiktokPostMode({}), "direct");
  assert.equal(tiktokPostMode({ TIKTOK_POST_MODE: "draft" }), "draft");
  assert.equal(hasScope("user.info.basic,video.publish", "video.publish"), true);
  assert.equal(hasScope("user.info.basic,user.info.stats", "video.publish"), false);
});

test("availability: feature flag on key, table, connection and scope", () => {
  const base = { clientKey: true, tokensKey: true, tableReady: true, connected: true, scope: "user.info.basic,video.publish", mode: "direct" };
  assert.deepEqual(tiktokPublishInfo(base), { enabled: true, mode: "direct", reason: null, note: TIKTOK_PRIVATE_NOTE });
  assert.match(tiktokPublishInfo({ ...base, clientKey: false }).reason, /TIKTOK_CLIENT_KEY/);
  assert.match(tiktokPublishInfo({ ...base, tableReady: false }).reason, /migration 100/);
  assert.match(tiktokPublishInfo({ ...base, connected: false }).reason, /pas connecté/);
  assert.match(tiktokPublishInfo({ ...base, scope: "user.info.basic,user.info.stats" }).reason, /video\.publish/);
  assert.match(tiktokPublishInfo({ ...base, mode: "draft" }).reason, /video\.upload/);
  assert.equal(TIKTOK_PRIVATE_NOTE, "TikTok : publication privée tant que l'application n'est pas validée par TikTok");
});

test("direct post: the saved settings, FILE_UPLOAD, PUT with Content-Range, then PUBLISH_COMPLETE", async () => {
  const { fetch, calls } = fakeTikTok(["PROCESSING_UPLOAD", "PUBLISH_COMPLETE"]);
  const progress = [];
  const res = await publishTikTok({ ...deps(fetch), onProgress: (p) => progress.push(p) }, "TOKEN-SECRET", "Villa à vendre", { mode: "direct", postInfo: PRIVATE_INFO });
  assert.equal(res.status, "published");
  assert.equal(res.container_id, "v_pub_1");
  assert.match(res.note, /privé/);
  const init = calls.find((c) => c.path === "/v2/post/publish/video/init/");
  const body = JSON.parse(init.body);
  assert.deepEqual(body.post_info, { title: "Villa à vendre", ...PRIVATE_INFO });
  assert.deepEqual(body.source_info, { source: "FILE_UPLOAD", video_size: 1000, chunk_size: 1000, total_chunk_count: 1 });
  assert.equal(init.headers.Authorization, "Bearer TOKEN-SECRET");
  const put = calls.find((c) => c.method === "PUT");
  assert.equal(put.headers["Content-Range"], "bytes 0-999/1000");
  assert.equal(put.headers.Authorization, undefined, "the upload URL is pre-signed: no token sent to it");
  assert.equal(progress[0].status, "pending");
  assert.equal(progress[0].container_id, "v_pub_1");
  assert.equal(progress[0].resume.next_chunk, 0);
  assert.equal(progress.at(-1).resume, null, "upload finished: no position left to resume");
});

test("draft mode uses the inbox endpoint and SEND_TO_USER_INBOX counts as done", async () => {
  const { fetch, calls } = fakeTikTok(["SEND_TO_USER_INBOX"]);
  const res = await publishTikTok(deps(fetch), "T", "x", { mode: "draft" });
  assert.equal(res.status, "published");
  assert.ok(calls.some((c) => c.path === "/v2/post/publish/inbox/video/init/"));
  assert.match(res.note, /brouillons/);
});

test("a saved publish_id is only checked, never re-posted; still processing stays pending", async () => {
  const { fetch, calls } = fakeTikTok(["PROCESSING_UPLOAD"]);
  const res = await publishTikTok(deps(fetch), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO, existingPublishId: "v_pub_old" });
  assert.equal(res.status, "pending");
  assert.equal(res.container_id, "v_pub_old");
  assert.ok(!calls.some((c) => c.path.endsWith("/init/")));
});

test("TikTok refusals become French errors", async () => {
  const failed = await publishTikTok(deps(fakeTikTok(["FAILED"]).fetch), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO });
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /fichier vidéo/);
  const scope = await publishTikTok(deps(fakeTikTok([], { initError: "scope_not_authorized" }).fetch), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO });
  assert.match(scope.error, /reconnectez TikTok/);
  assert.match(frenchTikTokError(new TikTokApiError("unaudited_client_can_only_post_to_private_accounts", 403, "")), /privé/);
  assert.match(frenchTikTokError(new TikTokApiError("access_token_invalid", 401, "")), /expiré/);
  assert.doesNotMatch(frenchTikTokError(new TikTokApiError("weird", 400, "see https://x.example/?token=SECRET")), /SECRET/);
});

// --- Streaming upload (2026-10-23): chunks, retries, deadline, resume, pull ---

const MiB = 1024 * 1024;

/** A video source that records every range asked and never holds the file. */
function trackedVideo(size, { failReadsAt = null } = {}) {
  const reads = [];
  let failed = false;
  return {
    reads,
    source: {
      url: "https://www.roogobf.com/api/admin/studio/final-videos/v1/stream?exp=1&token=t",
      size: async () => size,
      readRange: async (start, end) => {
        reads.push([start, end]);
        if (failReadsAt !== null && start === failReadsAt && !failed) {
          failed = true;
          throw new Error("network");
        }
        return new Uint8Array(end - start + 1);
      },
    },
  };
}

function uploadTikTok({ putStatuses = [], statuses = ["PUBLISH_COMPLETE"] } = {}) {
  const calls = [];
  let put = 0;
  let poll = 0;
  const fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ host: u.host, path: u.pathname, method: init.method, headers: init.headers, body: init.body });
    if (u.host === "upload.tiktok.example") {
      const status = putStatuses[put++] ?? 206;
      return { ok: status < 300, status, json: async () => ({}) };
    }
    if (u.pathname.endsWith("/video/init/")) {
      return { ok: true, status: 200, json: async () => ({ data: { publish_id: "v_pub_2", upload_url: "https://upload.tiktok.example/up?x=2" }, error: { code: "ok" } }) };
    }
    if (u.pathname === "/v2/post/publish/status/fetch/") {
      const status = statuses[Math.min(poll++, statuses.length - 1)];
      return { ok: true, status: 200, json: async () => ({ data: { status }, error: { code: "ok" } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, calls };
}

const streamDeps = (fetch, source, extra = {}) => ({ fetch, sleep: async () => {}, video: source, maxPolls: 2, now: () => "2026-10-23T19:00:00.000Z", ...extra });

test("a 500 MB video goes in 10 MB chunks with exact boundaries; the last chunk carries the remainder; never the whole file", async () => {
  const size = 500 * MiB + 123;
  const { reads, source } = trackedVideo(size);
  const { fetch, calls } = uploadTikTok();
  const res = await publishTikTok(streamDeps(fetch, source), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO });
  assert.equal(res.status, "published");
  const init = JSON.parse(calls.find((c) => c.path.endsWith("/init/")).body);
  assert.deepEqual(init.source_info, { source: "FILE_UPLOAD", video_size: size, chunk_size: CHUNK_SIZE, total_chunk_count: 50 });
  const puts = calls.filter((c) => c.method === "PUT");
  assert.equal(puts.length, 50);
  assert.equal(puts[0].headers["Content-Range"], `bytes 0-${CHUNK_SIZE - 1}/${size}`);
  assert.equal(puts[1].headers["Content-Range"], `bytes ${CHUNK_SIZE}-${2 * CHUNK_SIZE - 1}/${size}`);
  assert.equal(puts.at(-1).headers["Content-Range"], `bytes ${49 * CHUNK_SIZE}-${size - 1}/${size}`);
  assert.equal(puts.at(-1).body.byteLength, size - 49 * CHUNK_SIZE);
  // No full-buffer: every read and every body is at most two chunks (last one), never the file.
  assert.ok(reads.every(([a, b]) => b - a + 1 < 2 * CHUNK_SIZE));
  assert.ok(puts.every((p) => p.body.byteLength < 2 * CHUNK_SIZE));
  // Contiguous, no gap, no overlap.
  reads.forEach(([a], i) => assert.equal(a, i === 0 ? 0 : reads[i - 1][1] + 1));
});

test("one failed chunk is retried (read again from storage), the others are sent once", async () => {
  const size = 3 * CHUNK_SIZE + 10;
  const { reads, source } = trackedVideo(size, { failReadsAt: CHUNK_SIZE });
  const { fetch, calls } = uploadTikTok({ putStatuses: [206, 503, 206, 201] });
  const res = await publishTikTok(streamDeps(fetch, source), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO });
  assert.equal(res.status, "published");
  const ranges = calls.filter((c) => c.method === "PUT").map((p) => p.headers["Content-Range"].split("/")[0]);
  // chunk 1: read failed once, then PUT 503, then PUT ok; chunk 0 and 2 once.
  assert.deepEqual(ranges, [`bytes 0-${CHUNK_SIZE - 1}`, `bytes ${CHUNK_SIZE}-${2 * CHUNK_SIZE - 1}`, `bytes ${CHUNK_SIZE}-${2 * CHUNK_SIZE - 1}`, `bytes ${2 * CHUNK_SIZE}-${size - 1}`]);
  assert.equal(reads.filter(([a]) => a === CHUNK_SIZE).length, 3);
});

test("a chunk refused for good fails the network but keeps the position for « Réessayer »", async () => {
  const size = 2 * CHUNK_SIZE + 1;
  const { source } = trackedVideo(size);
  const { fetch } = uploadTikTok({ putStatuses: [206, 400] });
  const res = await publishTikTok(streamDeps(fetch, source), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO });
  assert.equal(res.status, "failed");
  assert.equal(res.container_id, "v_pub_2");
  assert.equal(res.resume.next_chunk, 1);
  assert.match(res.error, /envoi de la vidéo à TikTok/i);
});

test("near the run's deadline no new chunk starts: pending with the position, and the next run continues from it", async () => {
  const size = 4 * CHUNK_SIZE;
  const { source } = trackedVideo(size);
  let now = 1_000_000;
  const first = uploadTikTok();
  // Each PUT takes 50 s of the clock; the deadline leaves room for two chunks.
  const slowFetch = async (url, init) => {
    if (init.method === "PUT") now += 50_000;
    return first.fetch(url, init);
  };
  const saved = [];
  const res = await publishTikTok(streamDeps(slowFetch, source, { clock: () => now, deadline: now + 120_000, onProgress: (p) => saved.push(p) }), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO });
  assert.equal(res.status, "pending");
  assert.equal(res.resume.next_chunk, 2);
  assert.equal(first.calls.filter((c) => c.method === "PUT").length, 2);
  assert.ok(!first.calls.some((c) => c.path.endsWith("/status/fetch/")), "no status wait without the whole file");

  const second = uploadTikTok();
  const done = await publishTikTok(streamDeps(second.fetch, source, { clock: () => now }), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO, existingPublishId: res.container_id, resume: res.resume });
  assert.equal(done.status, "published");
  assert.ok(!second.calls.some((c) => c.path.endsWith("/init/")), "same upload, never a second post");
  const ranges = second.calls.filter((c) => c.method === "PUT").map((p) => p.headers["Content-Range"]);
  assert.deepEqual(ranges, [`bytes ${2 * CHUNK_SIZE}-${3 * CHUNK_SIZE - 1}/${size}`, `bytes ${3 * CHUNK_SIZE}-${size - 1}/${size}`]);
});

test("a saved position older than TikTok's upload_url (1 hour) starts a fresh upload", async () => {
  const { source } = trackedVideo(2 * CHUNK_SIZE);
  const { fetch, calls } = uploadTikTok();
  const stale = { upload_url: "https://upload.tiktok.example/old", next_chunk: 1, video_size: 2 * CHUNK_SIZE, chunk_size: CHUNK_SIZE, total_chunk_count: 2, expires_at: "2020-01-01T00:00:00.000Z" };
  const res = await publishTikTok(streamDeps(fetch, source), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO, existingPublishId: "v_old", resume: stale });
  assert.equal(res.status, "published");
  assert.equal(res.container_id, "v_pub_2");
  assert.equal(calls.filter((c) => c.method === "PUT").length, 2);
});

test("PULL_FROM_URL only under the verified prefix: TikTok downloads the signed link, nothing is read here", async () => {
  const { reads, source } = trackedVideo(400 * MiB);
  const { fetch, calls } = uploadTikTok();
  const res = await publishTikTok(streamDeps(fetch, source, { pullUrlPrefix: "https://www.roogobf.com/api/admin/studio/final-videos/" }), "T", "x", { mode: "direct", postInfo: PRIVATE_INFO });
  assert.equal(res.status, "published");
  const init = JSON.parse(calls.find((c) => c.path.endsWith("/init/")).body);
  assert.deepEqual(init.source_info, { source: "PULL_FROM_URL", video_url: source.url });
  assert.equal(reads.length, 0);
  assert.ok(!calls.some((c) => c.method === "PUT"));
  assert.equal(pullUrlAllowed(source.url, "https://other.example/"), false);
  assert.equal(pullUrlAllowed(source.url, ""), false);
  assert.equal(pullUrlAllowed(source.url, "http://www.roogobf.com/"), false, "https only");
});

test("direct mode sends exactly the settings chosen at approval, and never starts without them", async () => {
  const chosen = { privacy_level: "PUBLIC_TO_EVERYONE", disable_comment: false, disable_duet: true, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: true };
  const { fetch, calls } = fakeTikTok(["PUBLISH_COMPLETE"]);
  const res = await publishTikTok(deps(fetch), "T", "Villa à vendre", { mode: "direct", postInfo: chosen });
  assert.equal(res.status, "published");
  assert.equal(res.note, "Publiée sur TikTok");
  const body = JSON.parse(calls.find((c) => c.path === "/v2/post/publish/video/init/").body);
  assert.deepEqual(body.post_info, { title: "Villa à vendre", ...chosen });

  const empty = fakeTikTok(["PUBLISH_COMPLETE"]);
  const missing = await publishTikTok(deps(empty.fetch), "T", "x", { mode: "direct" });
  assert.equal(missing.status, "failed");
  assert.match(missing.error, /Réglages TikTok manquants/);
  assert.equal(empty.calls.length, 0, "nothing is sent to TikTok without saved settings");

  // Draft mode needs no settings (the account owner finishes in the TikTok app).
  const draft = await publishTikTok(deps(fakeTikTok(["SEND_TO_USER_INBOX"]).fetch), "T", "x", { mode: "draft" });
  assert.equal(draft.status, "published");
});
