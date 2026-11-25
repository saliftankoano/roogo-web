import test from "node:test";
import assert from "node:assert/strict";
import { MANUAL_NOTE, canMarkManual, handoffCopy, handoffMessage, manualTikTokResults, tiktokHandoff, whatsappShareUrl } from "./tiktok-handoff.ts";
import { finalStatus } from "./publishing.ts";

const post = (over) => ({ status: "publie", publishing: false, networks: ["facebook", "instagram", "youtube"], results: {}, ...over });

test("TikTok not ticked: to post by hand once the post is approved", () => {
  assert.equal(tiktokHandoff(post({ status: "a_valider" })), null);
  assert.equal(tiktokHandoff(post({ status: "valide" })), "todo");
  assert.equal(tiktokHandoff(post()), "todo");
});

test("TikTok ticked: the Studio's try comes first, a failure hands it over", () => {
  const ticked = { networks: ["facebook", "tiktok"] };
  assert.equal(tiktokHandoff(post({ ...ticked, status: "valide" })), "auto");
  assert.equal(tiktokHandoff(post({ ...ticked, status: "echec", publishing: true, results: { tiktok: { status: "failed" } } })), "auto");
  assert.equal(tiktokHandoff(post({ ...ticked, status: "echec", results: { tiktok: { status: "failed", error: "refus" } } })), "todo");
  assert.equal(tiktokHandoff(post({ ...ticked, results: { tiktok: { status: "published" } } })), "auto");
});

test("« C'est publié » waits for the publisher to finish", () => {
  assert.equal(canMarkManual(post({ status: "valide" })), false);
  assert.equal(canMarkManual(post({ status: "echec", publishing: true })), false);
  assert.equal(canMarkManual(post()), true);
  assert.equal(canMarkManual(post({ results: { tiktok: { status: "published", note: MANUAL_NOTE } } })), false);
});

test("marking TikTok done by hand only changes TikTok, and can close a failed post", () => {
  const results = { facebook: { status: "published", permalink: "https://fb/1" }, tiktok: { status: "failed", error: "refus", container_id: "x" } };
  const next = manualTikTokResults(results, "2026-11-25T16:00:00.000Z");
  assert.deepEqual(next.facebook, results.facebook);
  assert.deepEqual(next.tiktok, { status: "published", note: MANUAL_NOTE, published_at: "2026-11-25T16:00:00.000Z", error: null, held: false });
  assert.equal(finalStatus(["facebook", "tiktok"], next), "publie");
  assert.equal(tiktokHandoff(post({ networks: ["facebook", "tiktok"], results: next })), "done");
  // Another network still failed: the post stays failed.
  assert.equal(finalStatus(["facebook", "instagram", "tiktok"], next), "echec");
});

test("the text to paste: TikTok's version, else another network's, else the base", () => {
  const base = { text: "Base", hashtags: ["roogo"] };
  assert.equal(handoffCopy({ tiktok: { text: "TT", hashtags: [] }, instagram: { text: "IG", hashtags: [] } }, base).text, "TT");
  assert.equal(handoffCopy({ instagram: { text: "IG", hashtags: [] }, youtube: { text: "YT", hashtags: [] } }, base).text, "IG");
  assert.equal(handoffCopy({ youtube: { text: "YT", hashtags: [] } }, base).text, "Base");
  assert.equal(handoffCopy(undefined, base).text, "Base");
});

test("the WhatsApp message carries the Drive link, the text and the hashtags", () => {
  const message = handoffMessage({ title: "Villa à Ouaga 2000", driveUrl: "https://drive.google.com/file/d/abc/view", copy: { text: "Belle villa.\nroogobf.com", hashtags: ["#roogo", "ouaga"] } });
  assert.equal(
    message,
    "TikTok à publier à la main\nVilla à Ouaga 2000\n\nVidéo : https://drive.google.com/file/d/abc/view\n\nTexte à coller :\nBelle villa.\nroogobf.com\n\n#roogo #ouaga",
  );
  assert.ok(!/[—–]/.test(message));
  const url = whatsappShareUrl(message);
  assert.ok(url.startsWith("https://wa.me/?text="));
  assert.equal(decodeURIComponent(url.slice("https://wa.me/?text=".length)), message);
});

test("hashtags already in the text are not repeated", () => {
  const message = handoffMessage({ title: "T", driveUrl: "https://d", copy: { text: "Texte\n\n#roogo #ouaga", hashtags: ["roogo", "ouaga"] } });
  assert.equal(message.match(/#roogo/g).length, 1);
});
