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
  loadVideo: async () => new Uint8Array(size),
  now: () => "2026-10-21T19:00:00.000Z",
  maxPolls: 3,
});

test("chunk plan: one chunk up to 64 MB, 10 MB chunks with the remainder in the last", () => {
  assert.deepEqual(chunkPlan(1000), { videoSize: 1000, chunkSize: 1000, totalChunkCount: 1, ranges: [{ start: 0, end: 999 }] });
  assert.equal(chunkPlan(SINGLE_CHUNK_MAX).totalChunkCount, 1);
  const big = chunkPlan(SINGLE_CHUNK_MAX + 5);
  assert.equal(big.chunkSize, CHUNK_SIZE);
  assert.equal(big.totalChunkCount, Math.floor((SINGLE_CHUNK_MAX + 5) / CHUNK_SIZE));
  assert.equal(big.ranges.at(-1).end, SINGLE_CHUNK_MAX + 4);
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

test("direct post: SELF_ONLY, FILE_UPLOAD, PUT with Content-Range, then PUBLISH_COMPLETE", async () => {
  const { fetch, calls } = fakeTikTok(["PROCESSING_UPLOAD", "PUBLISH_COMPLETE"]);
  const progress = [];
  const res = await publishTikTok({ ...deps(fetch), onProgress: (p) => progress.push(p) }, "TOKEN-SECRET", "Villa à vendre", { mode: "direct" });
  assert.equal(res.status, "published");
  assert.equal(res.container_id, "v_pub_1");
  assert.match(res.note, /privé/);
  const init = calls.find((c) => c.path === "/v2/post/publish/video/init/");
  const body = JSON.parse(init.body);
  assert.equal(body.post_info.privacy_level, "SELF_ONLY");
  assert.equal(body.post_info.title, "Villa à vendre");
  assert.deepEqual(body.source_info, { source: "FILE_UPLOAD", video_size: 1000, chunk_size: 1000, total_chunk_count: 1 });
  assert.equal(init.headers.Authorization, "Bearer TOKEN-SECRET");
  const put = calls.find((c) => c.method === "PUT");
  assert.equal(put.headers["Content-Range"], "bytes 0-999/1000");
  assert.equal(put.headers.Authorization, undefined, "the upload URL is pre-signed: no token sent to it");
  assert.deepEqual(progress, [{ status: "pending", container_id: "v_pub_1" }]);
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
  const res = await publishTikTok(deps(fetch), "T", "x", { mode: "direct", existingPublishId: "v_pub_old" });
  assert.equal(res.status, "pending");
  assert.equal(res.container_id, "v_pub_old");
  assert.ok(!calls.some((c) => c.path.endsWith("/init/")));
});

test("TikTok refusals become French errors", async () => {
  const failed = await publishTikTok(deps(fakeTikTok(["FAILED"]).fetch), "T", "x", { mode: "direct" });
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /fichier vidéo/);
  const scope = await publishTikTok(deps(fakeTikTok([], { initError: "scope_not_authorized" }).fetch), "T", "x", { mode: "direct" });
  assert.match(scope.error, /reconnectez TikTok/);
  assert.match(frenchTikTokError(new TikTokApiError("unaudited_client_can_only_post_to_private_accounts", 403, "")), /privé/);
  assert.match(frenchTikTokError(new TikTokApiError("access_token_invalid", 401, "")), /expiré/);
  assert.doesNotMatch(frenchTikTokError(new TikTokApiError("weird", 400, "see https://x.example/?token=SECRET")), /SECRET/);
});
