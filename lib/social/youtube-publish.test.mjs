// « Publier une vidéo » to YouTube Shorts: the chunked, resumable publisher
// (publishYouTubeShort in lib/social/youtube-upload.ts) with a mocked fetch
// and a fake Drive range source. No real upload.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CHUNK_UNIT,
  DEFAULT_CHUNK_SIZE,
  QUOTA_ERROR,
  SESSION_TTL_MS,
  YOUTUBE_PRIVATE_NOTE,
  nextQuotaReset,
  publishYouTubeShort,
  youtubeNote,
  youtubePrivacy,
  youtubePublishInfo,
} from "./youtube-upload.ts";

const TOKEN = "ya29.PUBLISH-SECRET";
const SESSION = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=S1";
const INPUT = { title: "Villa à Balkuy, 35 000 000 FCFA", description: "WhatsApp : 67 00 61 16 · Appel : 53 11 11 19\nroogobf.com\n\n#Roogo #Shorts", privacyStatus: "private", width: 1080, height: 1920, durationSeconds: 42 };

function headers(map = {}) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => lower[name.toLowerCase()] ?? null };
}

/** A fake Drive file read by ranges: records each read so we know only one chunk is held at a time. */
function fakeVideo(size) {
  const reads = [];
  return {
    reads,
    source: {
      size: async () => size,
      readRange: async (start, end) => {
        reads.push([start, end]);
        return new Uint8Array(end - start + 1).fill(start % 251);
      },
    },
  };
}

/**
 * A fake YouTube resumable endpoint. `hold` bytes: how much it had from an
 * earlier run. `script[n]` forces the answer of the n-th PUT (chunk or probe).
 */
function fakeYouTube({ hold = 0, script = [], startStatus = 200, startBody = null, sessionGone = false, finished = false, keep = Infinity } = {}) {
  const calls = [];
  let received = hold;
  let put = 0;
  const fetch = async (url, init) => {
    calls.push({ url, init: { ...init, body: init.body ? { byteLength: init.body.byteLength ?? init.body.length } : undefined } });
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    if (init.method === "POST") {
      if (typeof init.body === "string") calls.at(-1).json = JSON.parse(init.body);
      return { ok: startStatus < 400, status: startStatus, headers: headers(startStatus < 400 ? { Location: SESSION } : {}), json: async () => startBody };
    }
    assert.equal(url, SESSION);
    const forced = script[put];
    put += 1;
    if (forced === "network") throw new Error("socket hang up");
    if (forced && typeof forced === "object") return { ok: false, status: forced.status, headers: headers(), json: async () => forced.body ?? null };
    if (typeof forced === "number") return { ok: false, status: forced, headers: headers(), json: async () => ({ error: { code: forced, message: "boom" } }) };
    if (sessionGone) return { ok: false, status: 404, headers: headers(), json: async () => null };
    const range = init.headers["Content-Range"];
    const probe = /^bytes \*\/(\d+)$/.exec(range);
    if (probe) {
      if (finished) return { ok: true, status: 200, headers: headers(), json: async () => ({ id: "DONE1" }) };
      return { ok: false, status: 308, headers: headers(received ? { Range: `bytes=0-${received - 1}` } : {}), json: async () => null };
    }
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    assert.ok(m, `bad Content-Range ${range}`);
    const [first, last, total] = m.slice(1).map(Number);
    assert.equal(first, received, "always continues from the first byte YouTube does not have");
    assert.equal(init.body.byteLength, last - first + 1);
    if (last + 1 < total) assert.equal((last - first + 1) % CHUNK_UNIT, 0, "every chunk but the last is a multiple of 256 KiB");
    // `keep`: YouTube only kept this many bytes of the chunk (it may keep less than was sent).
    received = Math.min(last + 1, first + keep);
    if (received < total) return { ok: false, status: 308, headers: headers({ Range: `bytes=0-${received - 1}` }), json: async () => null };
    return { ok: true, status: 201, headers: headers(), json: async () => ({ id: "VID9" }) };
  };
  return { fetch, calls, received: () => received };
}

const noSleep = async () => {};

test("chunks are multiples of 256 KiB, read one at a time from Drive, and the Shorts link is stored", async () => {
  const size = CHUNK_UNIT * 5 + 1234;
  const video = fakeVideo(size);
  const yt = fakeYouTube();
  const progress = [];
  // 600 KiB asked: rounded down to 512 KiB (2 x 256 KiB).
  const r = await publishYouTubeShort(
    { fetch: yt.fetch, video: video.source, contentType: "video/mp4", chunkSize: 600 * 1024, sleep: noSleep, onProgress: (p) => progress.push(p) },
    TOKEN,
    INPUT,
  );
  assert.equal(r.status, "published");
  assert.equal(r.remote_id, "VID9");
  assert.equal(r.permalink, "https://youtube.com/shorts/VID9");
  assert.equal(r.resume, null);
  assert.match(r.note, /privé/);
  const ranges = video.reads.map(([s, e]) => e - s + 1);
  assert.deepEqual(ranges, [2 * CHUNK_UNIT, 2 * CHUNK_UNIT, CHUNK_UNIT + 1234]);
  // Session saved before the first byte, then after each confirmed chunk.
  assert.equal(progress[0].resume.session_url, SESSION);
  assert.equal(progress[0].resume.next_byte, 0);
  assert.deepEqual(progress.slice(1).map((p) => p.resume.next_byte), [2 * CHUNK_UNIT, 4 * CHUNK_UNIT]);
  // The default chunk is 8 MiB, a multiple of 256 KiB.
  assert.equal(DEFAULT_CHUNK_SIZE % CHUNK_UNIT, 0);
  // The token is only in the Authorization header, never in a result.
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  assert.ok(!JSON.stringify(progress).includes("SECRET"));
});

test("metadata: private by default, public only when the flag says so", async () => {
  assert.equal(youtubePrivacy({}), "private");
  assert.equal(youtubePrivacy({ YOUTUBE_PUBLIC_UPLOADS: "false" }), "private");
  assert.equal(youtubePrivacy({ YOUTUBE_PUBLIC_UPLOADS: "TRUE" }), "public");
  assert.equal(youtubeNote("private"), YOUTUBE_PRIVATE_NOTE);
  assert.match(YOUTUBE_PRIVATE_NOTE, /^YouTube : publication privée tant que l'application n'est pas validée par YouTube$/);
  for (const privacyStatus of ["private", "public"]) {
    const yt = fakeYouTube();
    const r = await publishYouTubeShort({ fetch: yt.fetch, video: fakeVideo(1000).source, contentType: "video/mp4", sleep: noSleep }, TOKEN, { ...INPUT, privacyStatus });
    assert.equal(yt.calls[0].json.status.privacyStatus, privacyStatus);
    assert.equal(yt.calls[0].json.snippet.title, INPUT.title);
    assert.match(r.note, privacyStatus === "public" ? /Short/ : /privé/);
  }
});

test("a 308 tells where to continue: bytes YouTube did not keep are read again and sent from the first missing byte", async () => {
  const size = CHUNK_UNIT * 3;
  const video = fakeVideo(size);
  // 512 KiB sent per PUT, YouTube keeps only 256 KiB of each.
  const yt = fakeYouTube({ keep: CHUNK_UNIT });
  const r = await publishYouTubeShort({ fetch: yt.fetch, video: video.source, contentType: "video/mp4", chunkSize: 2 * CHUNK_UNIT, sleep: noSleep }, TOKEN, INPUT);
  assert.equal(r.status, "published");
  assert.deepEqual(video.reads.map(([s]) => s), [0, CHUNK_UNIT, 2 * CHUNK_UNIT]);
  assert.deepEqual(video.reads.at(-1), [2 * CHUNK_UNIT, size - 1]);
});

test("the deadline stops before a chunk with the session saved; the next run probes and continues without a second post", async () => {
  const size = CHUNK_UNIT * 4;
  let now = 1_000_000;
  const yt = fakeYouTube();
  const video = fakeVideo(size);
  let chunks = 0;
  const first = await publishYouTubeShort(
    {
      fetch: async (u, i) => {
        const res = await yt.fetch(u, i);
        if (i.method === "PUT") {
          chunks += 1;
          now += 60_000; // each chunk takes a minute
        }
        return res;
      },
      video: video.source,
      contentType: "video/mp4",
      chunkSize: CHUNK_UNIT,
      sleep: noSleep,
      clock: () => now,
      deadline: 1_000_000 + 140_000,
    },
    TOKEN,
    INPUT,
  );
  assert.equal(first.status, "pending");
  assert.match(first.error, /prochain passage/);
  assert.equal(chunks, 2, "two chunks fit before the 30 s margin");
  assert.equal(first.resume.next_byte, 2 * CHUNK_UNIT);
  assert.equal(first.resume.total, size);
  assert.equal(Date.parse(first.resume.expires_at), 1_000_000 + SESSION_TTL_MS);

  // Next run: no new session (no POST), a probe, then the remaining chunks.
  const before = yt.calls.length;
  const second = await publishYouTubeShort(
    { fetch: yt.fetch, video: video.source, contentType: "video/mp4", chunkSize: CHUNK_UNIT, sleep: noSleep, clock: () => now },
    TOKEN,
    INPUT,
    { resume: first.resume },
  );
  const later = yt.calls.slice(before);
  assert.equal(later.filter((c) => c.init.method === "POST").length, 0, "never opens a second session");
  assert.equal(later[0].init.headers["Content-Range"], `bytes */${size}`);
  assert.equal(second.status, "published");
  assert.equal(second.permalink, "https://youtube.com/shorts/VID9");
});

test("a session that already finished (run died after the last byte) returns its video instead of posting again", async () => {
  const yt = fakeYouTube({ finished: true });
  const resume = { session_url: SESSION, next_byte: 1000, total: 1000, expires_at: new Date(Date.now() + 3600_000).toISOString() };
  const r = await publishYouTubeShort({ fetch: yt.fetch, video: fakeVideo(1000).source, contentType: "video/mp4", sleep: noSleep }, TOKEN, INPUT, { resume });
  assert.equal(r.status, "published");
  assert.equal(r.remote_id, "DONE1");
  assert.equal(yt.calls.length, 1);
});

test("an expired or gone session starts again from zero (nothing was posted)", async () => {
  // Older than 6 days: not even probed.
  const old = { session_url: SESSION, next_byte: 500, total: 1000, expires_at: new Date(Date.now() - 1000).toISOString() };
  const yt = fakeYouTube();
  const r = await publishYouTubeShort({ fetch: yt.fetch, video: fakeVideo(1000).source, contentType: "video/mp4", sleep: noSleep }, TOKEN, INPUT, { resume: old });
  assert.equal(r.status, "published");
  assert.equal(yt.calls[0].init.method, "POST");
  // Probed and answered 404: a new session too.
  const fresh = { ...old, expires_at: new Date(Date.now() + 3600_000).toISOString() };
  const gone = fakeYouTube({ script: [404] });
  const r2 = await publishYouTubeShort({ fetch: gone.fetch, video: fakeVideo(1000).source, contentType: "video/mp4", sleep: noSleep }, TOKEN, INPUT, { resume: fresh });
  assert.equal(r2.status, "published");
  assert.deepEqual(gone.calls.map((c) => c.init.method), ["PUT", "POST", "PUT"]);
});

test("network errors and 5xx are retried from the byte YouTube confirms; repeated failures keep the position for « Réessayer »", async () => {
  const size = CHUNK_UNIT * 2;
  // PUT 1 ok, PUT 2 network error, probe, PUT 3 = 503, probe, PUT 4 completes.
  const yt = fakeYouTube({ script: [undefined, "network", undefined, 503, undefined, undefined] });
  const r = await publishYouTubeShort({ fetch: yt.fetch, video: fakeVideo(size).source, contentType: "video/mp4", chunkSize: CHUNK_UNIT, sleep: noSleep }, TOKEN, INPUT);
  assert.equal(r.status, "published");
  assert.equal(yt.calls.filter((c) => c.init.headers["Content-Range"]?.startsWith("bytes */")).length, 2);

  const down = fakeYouTube({ script: Array(30).fill(500) });
  const failed = await publishYouTubeShort({ fetch: down.fetch, video: fakeVideo(size).source, contentType: "video/mp4", chunkSize: CHUNK_UNIT, sleep: noSleep }, TOKEN, INPUT);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /reprises/);
  assert.equal(failed.resume.session_url, SESSION, "Réessayer continues the same session");
});

test("quota exceeded: « Échec » with a clear French message and a retry time after tomorrow's reset", async () => {
  const quotaBody = { error: { code: 403, message: "The request cannot be completed because you have exceeded your quota.", errors: [{ reason: "quotaExceeded" }] } };
  const at = Date.parse("2026-10-24T15:00:00Z");
  const r = await publishYouTubeShort(
    { fetch: fakeYouTube({ startStatus: 403, startBody: quotaBody }).fetch, video: fakeVideo(1000).source, contentType: "video/mp4", sleep: noSleep, clock: () => at },
    TOKEN,
    INPUT,
  );
  assert.equal(r.status, "failed");
  assert.equal(r.error, QUOTA_ERROR);
  assert.match(r.error, /1 600 unités sur 10 000/);
  assert.ok(!/[—–]/.test(r.error));
  assert.equal(r.retry_after, "2026-10-25T08:00:00.000Z");
  // Before 08:00 UTC the reset is the same day.
  assert.equal(nextQuotaReset(new Date("2026-10-24T03:00:00Z")), "2026-10-24T08:00:00.000Z");
  // The quota error on a chunk is handled the same way.
  const onChunk = await publishYouTubeShort(
    { fetch: fakeYouTube({ script: [{ status: 403, body: quotaBody }] }).fetch, video: fakeVideo(1000).source, contentType: "video/mp4", sleep: noSleep, clock: () => at },
    TOKEN,
    INPUT,
  );
  assert.equal(onChunk.error, QUOTA_ERROR);
  assert.ok(onChunk.retry_after);
});

test("permission and token errors are French; 401 keeps the position", async () => {
  const perm = await publishYouTubeShort(
    { fetch: fakeYouTube({ startStatus: 403, startBody: { error: { errors: [{ reason: "insufficientPermissions" }] } } }).fetch, video: fakeVideo(10).source, contentType: "video/mp4", sleep: noSleep },
    TOKEN,
    INPUT,
  );
  assert.match(perm.error, /youtube\.upload/);
  assert.equal(perm.retry_after, undefined);
  const expired = await publishYouTubeShort({ fetch: fakeYouTube({ script: [401] }).fetch, video: fakeVideo(10).source, contentType: "video/mp4", sleep: noSleep }, TOKEN, INPUT);
  assert.match(expired.error, /reconnecter YouTube/);
  assert.equal(expired.resume.session_url, SESSION);
});

test("YouTube is offered only when connected with upload permission, with a French reason otherwise", () => {
  const ok = { configured: true, missing: [], tableReady: true, connected: true, canUpload: true };
  assert.deepEqual(youtubePublishInfo(ok, {}), { enabled: true, reason: null, privacy: "private", note: YOUTUBE_PRIVATE_NOTE });
  assert.equal(youtubePublishInfo(ok, { YOUTUBE_PUBLIC_UPLOADS: "true" }).privacy, "public");
  assert.match(youtubePublishInfo({ ...ok, canUpload: false }, {}).reason, /youtube\.upload/);
  assert.match(youtubePublishInfo({ ...ok, connected: false }, {}).reason, /pas connectée/);
  assert.match(youtubePublishInfo({ ...ok, configured: false, missing: ["YOUTUBE_CLIENT_ID"] }, {}).reason, /YOUTUBE_CLIENT_ID/);
  assert.match(youtubePublishInfo({ ...ok, tableReady: false }, {}).reason, /migration/);
  assert.equal(youtubePublishInfo(null, {}).enabled, false);
  for (const s of [ok, { ...ok, canUpload: false }, { ...ok, connected: false }, null]) {
    const info = youtubePublishInfo(s, {});
    assert.ok(!/[—–]/.test(`${info.reason ?? ""}${info.note}`));
  }
});
