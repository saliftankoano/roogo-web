// The unwired resumable Shorts upload helper (lib/social/youtube-upload.ts), with a mocked fetch.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CHUNK_UNIT,
  TITLE_MAX,
  YOUTUBE_UPLOAD_URL,
  buildShortMetadata,
  frenchUploadError,
  isShortCandidate,
  lastByteOf,
  uploadYouTubeShort,
} from "./youtube-upload.ts";

const TOKEN = "ya29.UPLOAD-SECRET";
const SESSION = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=SESSION1";
const VERTICAL = { width: 1080, height: 1920, durationSeconds: 42 };
const INPUT = { title: "Villa 2 chambres à Balkuy, 35 millions | Roogo", description: "WhatsApp : 67 00 61 16\nroogobf.com", privacyStatus: "private", ...VERTICAL };

function headers(map = {}) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => lower[name.toLowerCase()] ?? null };
}

/** A fake YouTube that stores what it receives; `script` can force answers per PUT. */
function fakeUpload({ script = [], startStatus = 200, startBody = null, location = SESSION } = {}) {
  const calls = [];
  let received = 0;
  let put = 0;
  const fetch = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!url.includes("SECRET"));
    if (init.method === "POST") {
      return { ok: startStatus < 400, status: startStatus, headers: headers(startStatus < 400 && location ? { Location: location } : {}), json: async () => startBody };
    }
    assert.equal(url, SESSION);
    const range = init.headers["Content-Range"];
    const forced = script[put];
    put += 1;
    if (forced === "network") throw new Error("socket hang up");
    if (typeof forced === "number") return { ok: false, status: forced, headers: headers(), json: async () => ({ error: { code: forced, message: "boom" } }) };
    const probe = /^bytes \*\/(\d+)$/.exec(range);
    if (probe) {
      return { ok: false, status: 308, headers: headers(received ? { Range: `bytes=0-${received - 1}` } : {}), json: async () => null };
    }
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    assert.ok(m, `bad Content-Range ${range}`);
    const [first, last, total] = m.slice(1).map(Number);
    assert.equal(first, received, "resumes from the last confirmed byte");
    assert.equal(init.body.byteLength, last - first + 1);
    received = last + 1;
    if (received < total) return { ok: false, status: 308, headers: headers({ Range: `bytes=0-${received - 1}` }), json: async () => null };
    return { ok: true, status: 200, headers: headers(), json: async () => ({ id: "VID123", status: { privacyStatus: "private" } }) };
  };
  return { fetch, calls };
}

test("a Short is vertical and 3 minutes or less", () => {
  assert.equal(isShortCandidate(VERTICAL), true);
  assert.equal(isShortCandidate({ width: 1920, height: 1080, durationSeconds: 42 }), false);
  assert.equal(isShortCandidate({ width: 1080, height: 1920, durationSeconds: 181 }), false);
  assert.equal(isShortCandidate({ width: 1080, height: 1920, durationSeconds: 180 }), true);
  assert.equal(isShortCandidate({ width: null, height: 1920, durationSeconds: 10 }), false);
});

test("metadata: title cut at 100, #Shorts added once for a vertical Short, privacy passed through", () => {
  const m = buildShortMetadata({ ...INPUT, title: `<b>${"x".repeat(150)}</b>` });
  assert.equal([...m.snippet.title].length, TITLE_MAX);
  assert.ok(!/[<>]/.test(m.snippet.title));
  assert.ok(m.snippet.description.endsWith("#Shorts"));
  assert.ok(m.snippet.description.startsWith("WhatsApp : 67 00 61 16"));
  assert.deepEqual(m.status, { privacyStatus: "private", selfDeclaredMadeForKids: false, embeddable: true });
  assert.equal(buildShortMetadata({ ...INPUT, privacyStatus: "public" }).status.privacyStatus, "public");
  const already = buildShortMetadata({ ...INPUT, description: "Visite #shorts" });
  assert.equal(already.snippet.description, "Visite #shorts");
  const landscape = buildShortMetadata({ ...INPUT, width: 1920, height: 1080 });
  assert.ok(!landscape.snippet.description.includes("#Shorts"));
  const long = buildShortMetadata({ ...INPUT, description: "é".repeat(4000) });
  assert.ok(new TextEncoder().encode(long.snippet.description).length <= 5000);
  assert.ok(long.snippet.description.endsWith("#Shorts"));
});

test("uploads in 256 KiB-multiple chunks through a resumable session and returns the Shorts URL", async () => {
  const bytes = new Uint8Array(CHUNK_UNIT * 2 + 1000).fill(7);
  const yt = fakeUpload();
  const r = await uploadYouTubeShort({ token: TOKEN, bytes, contentType: "video/mp4", input: INPUT, chunkSize: CHUNK_UNIT }, yt.fetch);
  assert.deepEqual(r, { ok: true, videoId: "VID123", url: "https://www.youtube.com/shorts/VID123" });
  const start = yt.calls[0];
  assert.equal(start.url, `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`);
  assert.equal(start.init.headers["X-Upload-Content-Length"], String(bytes.byteLength));
  assert.equal(start.init.headers["X-Upload-Content-Type"], "video/mp4");
  const body = JSON.parse(start.init.body);
  assert.equal(body.status.privacyStatus, "private");
  assert.ok(body.snippet.description.includes("#Shorts"));
  const ranges = yt.calls.slice(1).map((c) => c.init.headers["Content-Range"]);
  assert.deepEqual(ranges, [`bytes 0-${CHUNK_UNIT - 1}/${bytes.byteLength}`, `bytes ${CHUNK_UNIT}-${2 * CHUNK_UNIT - 1}/${bytes.byteLength}`, `bytes ${2 * CHUNK_UNIT}-${bytes.byteLength - 1}/${bytes.byteLength}`]);
});

test("a landscape upload gets the watch URL", async () => {
  const r = await uploadYouTubeShort({ token: TOKEN, bytes: new Uint8Array(10), contentType: "video/mp4", input: { ...INPUT, width: 1920, height: 1080 } }, fakeUpload().fetch);
  assert.equal(r.url, "https://www.youtube.com/watch?v=VID123");
});

test("resumes after a network error and a 503 from the byte YouTube confirms", async () => {
  const bytes = new Uint8Array(CHUNK_UNIT * 2).fill(1);
  // PUT 1 ok (308), PUT 2 network error, probe, PUT 3 = 503, probe, PUT 4 completes.
  const yt = fakeUpload({ script: [undefined, "network", undefined, 503, undefined, undefined] });
  const r = await uploadYouTubeShort({ token: TOKEN, bytes, contentType: "video/mp4", input: INPUT, chunkSize: CHUNK_UNIT }, yt.fetch);
  assert.equal(r.ok, true);
  const probes = yt.calls.filter((c) => c.init.headers["Content-Range"]?.startsWith("bytes */"));
  assert.equal(probes.length, 2);
});

test("gives up after repeated failures with a French message", async () => {
  const yt = fakeUpload({ script: Array(20).fill(500) });
  const r = await uploadYouTubeShort({ token: TOKEN, bytes: new Uint8Array(100), contentType: "video/mp4", input: INPUT }, yt.fetch);
  assert.equal(r.ok, false);
  assert.match(r.error, /reprises/);
});

test("quota, permission and token errors become French reasons; the session must exist", async () => {
  const quota = await uploadYouTubeShort(
    { token: TOKEN, bytes: new Uint8Array(10), contentType: "video/mp4", input: INPUT },
    fakeUpload({ startStatus: 403, startBody: { error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } } }).fetch,
  );
  assert.equal(quota.ok, false);
  assert.equal(quota.reason, "quotaExceeded");
  assert.match(quota.error, /quota YouTube/);
  assert.match(frenchUploadError(401, null).error, /reconnecter YouTube/);
  assert.match(frenchUploadError(403, { error: { errors: [{ reason: "insufficientPermissions" }] } }).error, /youtube\.upload/);
  assert.match(frenchUploadError(400, { error: { errors: [{ reason: "uploadLimitExceeded" }] } }).error, /limite/);
  const noLocation = await uploadYouTubeShort({ token: TOKEN, bytes: new Uint8Array(10), contentType: "video/mp4", input: INPUT }, fakeUpload({ location: null }).fetch);
  assert.match(noLocation.error, /session/);
  const empty = await uploadYouTubeShort({ token: TOKEN, bytes: new Uint8Array(0), contentType: "video/mp4", input: INPUT }, fakeUpload().fetch);
  assert.match(empty.error, /vide/);
});

test("Range header parsing", () => {
  assert.equal(lastByteOf("bytes=0-262143"), 262143);
  assert.equal(lastByteOf(null), -1);
  assert.equal(lastByteOf("garbage"), -1);
});
