import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GRAPH_VERSION,
  MetaError,
  fb,
  frenchMetaError,
  ig,
  metaConfigFromEnv,
  publishFacebook,
  publishInstagram,
  withPageToken,
} from "./meta-graph.ts";

// No test may reach the network.
globalThis.fetch = () => {
  throw new Error("real network call in a test");
};

const cfg = { graphVersion: "v25.0", pageId: "PAGE1", igUserId: "IG1", pageToken: "TOKEN-SECRET" };

/** A fake fetch: each handler matches "METHOD path" and returns JSON. Records every call. */
function fakeMeta(handlers) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v\d+\.\d+\//, "").replace(/^\/video-upload\/v\d+\.\d+\//, "rupload/");
    const params = init.method === "GET" ? Object.fromEntries(u.searchParams) : Object.fromEntries(new URLSearchParams(init.body ?? ""));
    const call = { method: init.method, host: u.host, path, params, headers: init.headers };
    calls.push(call);
    const key = `${init.method} ${path}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected call ${key}`);
    const out = typeof handler === "function" ? handler(call, calls) : handler;
    const status = out.__status ?? 200;
    return { ok: status < 400, status, json: async () => out };
  };
  return { fetch, calls };
}

const deps = (fetch, extra = {}) => ({ fetch, sleep: async () => {}, now: () => "2026-10-12T19:00:00.000Z", pollIntervalMs: 1, maxPolls: 3, ...extra });

test("config comes from the environment and reports what is missing", () => {
  const empty = metaConfigFromEnv({});
  assert.equal(empty.config, null);
  assert.deepEqual(empty.missing, ["META_GRAPH_TOKEN", "META_PAGE_ID", "META_IG_ACCOUNT_ID"]);
  const fbOnly = metaConfigFromEnv({ META_GRAPH_TOKEN: "t", META_PAGE_ID: "p", META_GRAPH_VERSION: "nope" });
  assert.equal(fbOnly.facebook, true);
  assert.equal(fbOnly.instagram, false);
  assert.equal(fbOnly.config.graphVersion, DEFAULT_GRAPH_VERSION);
  assert.equal(fbOnly.config.needsPageToken, true);
  assert.equal(metaConfigFromEnv({ META_GRAPH_TOKEN: "t", META_IG_ACCOUNT_ID: "i", META_GRAPH_VERSION: "v26.0" }).config.graphVersion, "v26.0");
});

test("the main env names win; the first names of this branch still work", () => {
  const main = metaConfigFromEnv({ META_GRAPH_TOKEN: "sys", META_PAGE_ACCESS_TOKEN: "page", META_PAGE_ID: "p", META_IG_ACCOUNT_ID: "ig-main", META_IG_USER_ID: "ig-old" });
  assert.equal(main.config.pageToken, "sys");
  assert.equal(main.config.needsPageToken, true);
  assert.equal(main.config.igUserId, "ig-main");
  const legacy = metaConfigFromEnv({ META_PAGE_ACCESS_TOKEN: "page", META_PAGE_ID: "p", META_IG_USER_ID: "ig-old" });
  assert.equal(legacy.config.pageToken, "page");
  assert.equal(legacy.config.needsPageToken, false);
  assert.equal(legacy.config.igUserId, "ig-old");
  assert.deepEqual(legacy.missing, []);
});

test("Facebook swaps the system user token for the Page token, once", async () => {
  const { fetch, calls } = fakeMeta({ "GET PAGE1": { access_token: "PAGE-TOKEN", id: "PAGE1" } });
  const sys = { ...cfg, pageToken: "SYS-TOKEN", needsPageToken: true };
  const out = await withPageToken(deps(fetch), sys);
  assert.equal(out.pageToken, "PAGE-TOKEN");
  assert.equal(out.needsPageToken, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.fields, "access_token");
  assert.equal(calls[0].params.access_token, "SYS-TOKEN");
  // A Page token is used as is.
  assert.equal(await withPageToken(deps(fetch), cfg), cfg);
  assert.equal(calls.length, 1);
});

test("a system user token that cannot read the Page token fails in French", async () => {
  const { fetch } = fakeMeta({ "GET PAGE1": { id: "PAGE1" } });
  await assert.rejects(withPageToken(deps(fetch), { ...cfg, needsPageToken: true }), (error) => {
    assert.match(frenchMetaError(error), /META_GRAPH_TOKEN/);
    return true;
  });
});

test("request builders target the documented endpoints", () => {
  const reel = ig.reel(cfg, "https://s/v.mp4", "Légende");
  assert.equal(reel.url, "https://graph.facebook.com/v25.0/IG1/media");
  const body = new URLSearchParams(reel.body);
  assert.equal(body.get("media_type"), "REELS");
  assert.equal(body.get("video_url"), "https://s/v.mp4");
  assert.equal(body.get("share_to_feed"), "true");
  assert.equal(body.get("access_token"), "TOKEN-SECRET");

  const up = fb.reelUpload(cfg, "VID", "https://s/v.mp4");
  assert.equal(up.url, "https://rupload.facebook.com/video-upload/v25.0/VID");
  assert.equal(up.headers.Authorization, "OAuth TOKEN-SECRET");
  assert.equal(up.headers.file_url, "https://s/v.mp4");

  const multi = new URLSearchParams(fb.multiPhotoPost(cfg, "Texte", ["a", "b"]).body);
  assert.equal(multi.get("attached_media[0]"), '{"media_fbid":"a"}');
  assert.equal(multi.get("attached_media[1]"), '{"media_fbid":"b"}');

  const carousel = new URLSearchParams(ig.carousel(cfg, ["c1", "c2"], "L").body);
  assert.equal(carousel.get("media_type"), "CAROUSEL");
  assert.equal(carousel.get("children"), "c1,c2");
  assert.match(ig.status(cfg, "C9").url, /\/C9\?fields=status_code&access_token=/);
});

test("Facebook Reel: start, upload by URL, wait, finish, permalink", async () => {
  let statusCalls = 0;
  const meta = fakeMeta({
    "POST PAGE1/video_reels": (call) =>
      call.params.upload_phase === "start" ? { video_id: "VID", upload_url: "x" } : { success: true },
    "POST rupload/VID": { success: true },
    "GET VID": (call) =>
      call.params.fields === "status"
        ? { status: { video_status: ++statusCalls < 2 ? "processing" : "upload_complete", uploading_phase: { status: statusCalls < 2 ? "in_progress" : "complete" } } }
        : { permalink_url: "/reel/123" },
  });
  const result = await publishFacebook(deps(meta.fetch), cfg, { kind: "video", url: "https://s/v.mp4" }, "MAISON À LOUER");
  assert.deepEqual(result, {
    status: "published",
    remote_id: "VID",
    permalink: "https://www.facebook.com/reel/123",
    published_at: "2026-10-12T19:00:00.000Z",
  });
  const finish = meta.calls.find((c) => c.params.upload_phase === "finish");
  assert.equal(finish.params.video_state, "PUBLISHED");
  assert.equal(finish.params.description, "MAISON À LOUER");
  assert.equal(meta.calls.find((c) => c.host === "rupload.facebook.com").headers.file_url, "https://s/v.mp4");
});

test("Facebook multi-photo post: unpublished photos then one feed post", async () => {
  let n = 0;
  const meta = fakeMeta({
    "POST PAGE1/photos": (call) => {
      assert.equal(call.params.published, "false");
      return { id: `ph${++n}` };
    },
    "POST PAGE1/feed": (call) => {
      assert.equal(call.params["attached_media[1]"], '{"media_fbid":"ph2"}');
      return { id: "PAGE1_999" };
    },
    "GET PAGE1_999": { permalink_url: "https://www.facebook.com/roogo/posts/999" },
  });
  const result = await publishFacebook(deps(meta.fetch), cfg, { kind: "images", urls: ["https://a/1.jpg", "https://a/2.jpg"] }, "Texte");
  assert.equal(result.status, "published");
  assert.equal(result.remote_id, "PAGE1_999");
  assert.equal(result.permalink, "https://www.facebook.com/roogo/posts/999");
});

test("Facebook single photo and 3D link comment", async () => {
  const meta = fakeMeta({
    "POST PAGE1/photos": { id: "ph", post_id: "PAGE1_1" },
    "GET PAGE1_1": { permalink_url: "https://fb/p/1" },
    "POST PAGE1_1/comments": { id: "cm1" },
    "GET cm1": { permalink_url: "https://fb/c/1" },
  });
  const photo = await publishFacebook(deps(meta.fetch), cfg, { kind: "images", urls: ["https://a/1.jpg"] }, "T");
  assert.equal(photo.remote_id, "PAGE1_1");
  const comment = await publishFacebook(deps(meta.fetch), cfg, { kind: "text" }, "Visite 3D : https://x", { commentOn: "PAGE1_1" });
  assert.equal(comment.status, "published");
  assert.equal(comment.remote_id, "cm1");
});

test("Facebook errors become readable French and never leak the token", async () => {
  const meta = fakeMeta({
    "POST PAGE1/video_reels": { __status: 400, error: { code: 190, message: "Error validating access token TOKEN-SECRET" } },
  });
  const result = await publishFacebook(deps(meta.fetch), cfg, { kind: "video", url: "https://s/v.mp4" }, "x");
  assert.equal(result.status, "failed");
  assert.match(result.error, /jeton Meta a expiré/);
  assert.doesNotMatch(result.error, /TOKEN-SECRET/);
  assert.match(frenchMetaError(new MetaError(4, null, 400, "rate")), /Limite de publications/);
  assert.match(frenchMetaError(new MetaError(100, 2207026, 400, "bad video")), /format refusé/);
  assert.match(frenchMetaError(new MetaError(100, null, 400, "see https://x?access_token=abc")), /\[lien\]/);
  assert.match(frenchMetaError(new TypeError("fetch failed")), /connexion à Meta/);
});

test("Instagram Reel: container, poll until FINISHED, publish, permalink", async () => {
  let polls = 0;
  const progress = [];
  const meta = fakeMeta({
    "POST IG1/media": { id: "CONT" },
    "GET CONT": () => ({ status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" }),
    "POST IG1/media_publish": (call) => {
      assert.equal(call.params.creation_id, "CONT");
      return { id: "MEDIA" };
    },
    "GET MEDIA": { permalink: "https://www.instagram.com/reel/abc/" },
  });
  const result = await publishInstagram(deps(meta.fetch, { onProgress: (p) => progress.push(p) }), cfg, { kind: "video", url: "https://s/v.mp4" }, "L");
  assert.deepEqual(result, {
    status: "published",
    container_id: "CONT",
    remote_id: "MEDIA",
    permalink: "https://www.instagram.com/reel/abc/",
    published_at: "2026-10-12T19:00:00.000Z",
  });
  assert.deepEqual(progress, [{ status: "pending", container_id: "CONT" }]);
});

test("Instagram: still processing keeps the container for the next try", async () => {
  const meta = fakeMeta({
    "POST IG1/media": { id: "CONT" },
    "GET CONT": { status_code: "IN_PROGRESS" },
  });
  const result = await publishInstagram(deps(meta.fetch), cfg, { kind: "video", url: "https://s/v.mp4" }, "L");
  assert.equal(result.status, "pending");
  assert.equal(result.container_id, "CONT");
  assert.equal(meta.calls.filter((c) => c.path === "IG1/media_publish").length, 0);
});

test("Instagram: a saved container is reused, and an already published one is never published again", async () => {
  const meta = fakeMeta({
    "GET OLD": { status_code: "PUBLISHED" },
  });
  const result = await publishInstagram(deps(meta.fetch), cfg, { kind: "video", url: "https://s/v.mp4" }, "L", { existingContainerId: "OLD" });
  assert.equal(result.status, "published");
  assert.equal(meta.calls.some((c) => c.method === "POST"), false);

  const meta2 = fakeMeta({
    "GET OLD": { status_code: "FINISHED" },
    "POST IG1/media_publish": { id: "M2" },
    "GET M2": { permalink: "https://ig/p/2" },
  });
  const again = await publishInstagram(deps(meta2.fetch), cfg, { kind: "video", url: "https://s/v.mp4" }, "L", { existingContainerId: "OLD" });
  assert.equal(again.remote_id, "M2");
  assert.equal(meta2.calls.filter((c) => c.path === "IG1/media").length, 0);
});

test("Instagram carousel: child containers, then the carousel, then publish", async () => {
  let child = 0;
  const meta = fakeMeta({
    "POST IG1/media": (call) => {
      if (call.params.is_carousel_item === "true") return { id: `ch${++child}` };
      assert.equal(call.params.media_type, "CAROUSEL");
      assert.equal(call.params.children, "ch1,ch2,ch3");
      return { id: "CAR" };
    },
    "GET ch1": { status_code: "FINISHED" },
    "GET ch2": { status_code: "FINISHED" },
    "GET ch3": { status_code: "FINISHED" },
    "GET CAR": { status_code: "FINISHED" },
    "POST IG1/media_publish": { id: "M3" },
    "GET M3": { permalink: "https://ig/p/3" },
  });
  const result = await publishInstagram(deps(meta.fetch), cfg, { kind: "images", urls: ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"] }, "L");
  assert.equal(result.status, "published");
  assert.equal(result.remote_id, "M3");
});

test("Instagram refuses text-only posts and failed containers with French messages", async () => {
  const meta = fakeMeta({});
  const text = await publishInstagram(deps(meta.fetch), cfg, { kind: "text" }, "L");
  assert.equal(text.status, "failed");
  assert.equal(text.error, "Instagram ne publie pas de texte seul.");
  assert.equal(meta.calls.length, 0);

  const meta2 = fakeMeta({
    "POST IG1/media": { id: "C" },
    "GET C": { status_code: "ERROR" },
  });
  const bad = await publishInstagram(deps(meta2.fetch), cfg, { kind: "images", urls: ["https://a/1.jpg"] }, "L");
  assert.equal(bad.status, "failed");
  assert.match(bad.error, /Instagram a refusé le fichier/);
  assert.equal(bad.container_id, null);
});
