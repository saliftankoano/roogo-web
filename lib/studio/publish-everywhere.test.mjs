import test from "node:test";
import assert from "node:assert/strict";
import {
  COPY_RULES,
  CONTACT_LINE,
  DEFAULT_FINAL_VIDEOS_FOLDER_ID,
  DEFAULT_PUBLISHED_VIDEOS_FOLDER_ID,
  FINAL_VIDEO_MAX_BYTES,
  SITE_LINE,
  amountsIn,
  checkFinalVideo,
  copyPostText,
  copyProblems,
  defaultTicks,
  destinationOptions,
  finalVideoDriveName,
  finalizeNetworkCopy,
  listingVideoTitle,
  networkCopyErrors,
  parseNetworkCopy,
  resolveFinalVideoFolders,
  sameTextEverywhere,
  scheduledAtOnApproval,
  shouldMoveToPublished,
  tagWord,
  ticksToNetworks,
  titleFromFileName,
  uploaderStatus,
  shortenTitle,
  youtubeShortFields,
} from "./publish-everywhere.ts";
import { CAPTION_CONTACT, canChangeStatus, clearHeld, continueLater, finalStatus, hashtagWord, networksToPublish, quotaRetryDue, retryResults } from "./publishing.ts";
import { buildNetworkCopyRequest, parseNetworkCopyOutput, requestNetworkCopy } from "./publication-ai.ts";
import { publishFacebook } from "./meta-graph.ts";
import { rangeSource, totalFromContentRange } from "./range-source.ts";

const MB = 1024 * 1024;
const vertical = { fileName: "Villa Balkuy.mp4", mimeType: "video/mp4", sizeBytes: 80 * MB, durationSeconds: 62, width: 1080, height: 1920 };

// --- The video: refused before upload -----------------------------------------

test("a vertical 9:16 MP4 or MOV up to 3 minutes and 500 MB is accepted", () => {
  assert.deepEqual(checkFinalVideo(vertical), { ok: true, mimeType: "video/mp4", ext: "mp4" });
  assert.equal(checkFinalVideo({ ...vertical, fileName: "IMG_2041.MOV", mimeType: "video/quicktime", width: 720, height: 1280 }).ok, true);
  // iOS sometimes sends no MIME type: the extension decides.
  assert.equal(checkFinalVideo({ ...vertical, fileName: "clip.mov", mimeType: "" }).ok, true);
  // A 3:00 export that lasts 180.03 s still passes; exactly 500 MB passes.
  assert.equal(checkFinalVideo({ ...vertical, durationSeconds: 180.03 }).ok, true);
  assert.equal(checkFinalVideo({ ...vertical, sizeBytes: FINAL_VIDEO_MAX_BYTES }).ok, true);
});

test("horizontal, square, odd ratios, too long, too heavy, other formats and unreadable videos are refused in French", () => {
  const cases = [
    [{ ...vertical, width: 1920, height: 1080 }, "not-vertical", /horizontale/],
    [{ ...vertical, width: 1080, height: 1080 }, "not-vertical", /carrée/],
    [{ ...vertical, width: 1080, height: 2340 }, "not-vertical", /9:16/],
    [{ ...vertical, durationSeconds: 205 }, "too-long", /3 min 25 s.*3 minutes/],
    [{ ...vertical, sizeBytes: FINAL_VIDEO_MAX_BYTES + 1 }, "too-big", /500 Mo/],
    [{ ...vertical, fileName: "clip.webm", mimeType: "video/webm" }, "format", /MP4 ou MOV/],
    [{ ...vertical, fileName: "photo.jpg", mimeType: "image/jpeg" }, "format", /MP4 ou MOV/],
    [{ ...vertical, durationSeconds: null, width: null, height: null }, "unreadable", /navigateur/],
    [{ ...vertical, sizeBytes: 0 }, "empty", /vide/],
  ];
  for (const [facts, code, message] of cases) {
    const result = checkFinalVideo(facts);
    assert.equal(result.ok, false, JSON.stringify(facts));
    assert.equal(result.code, code);
    assert.match(result.message, message);
    assert.ok(!/[—–]/.test(result.message), "no dash in user copy");
  }
});

// --- Destinations ticked by default ---------------------------------------------

test("every connected network is ticked by default; YouTube Shorts without a connection is disabled with the reason", () => {
  const options = destinationOptions({ facebook: true, instagram: true, tiktok: { enabled: true, reason: null }, youtube: null });
  assert.deepEqual(options.map((o) => o.id), ["facebook", "instagram", "tiktok", "youtube"]);
  assert.deepEqual(defaultTicks(options), ["facebook", "instagram", "tiktok"]);
  const yt = options.find((o) => o.id === "youtube");
  assert.equal(yt.available, false);
  assert.equal(yt.label, "YouTube Shorts");
  assert.match(yt.reason, /YouTube/);
});

test("a network that is not connected says why and cannot be ticked", () => {
  const options = destinationOptions({ facebook: true, instagram: false, tiktok: { enabled: false, reason: "TikTok n'est pas connecté." }, youtube: null });
  assert.deepEqual(defaultTicks(options), ["facebook"]);
  assert.match(options.find((o) => o.id === "instagram").reason, /Instagram/);
  assert.equal(options.find((o) => o.id === "tiktok").reason, "TikTok n'est pas connecté.");
  // The server drops anything not available, YouTube included, whatever the browser sent.
  assert.deepEqual(ticksToNetworks(["facebook", "instagram", "tiktok", "youtube", "facebook"], options), ["facebook"]);
});

test("YouTube connected with upload permission is ticked by default and published", () => {
  const options = destinationOptions({ facebook: true, instagram: true, tiktok: null, youtube: { enabled: true, reason: null } });
  assert.deepEqual(defaultTicks(options), ["facebook", "instagram", "youtube"]);
  assert.equal(options.find((o) => o.id === "youtube").label, "YouTube Shorts");
  assert.deepEqual(ticksToNetworks(["youtube", "facebook"], options), ["youtube", "facebook"]);
  // Connected without youtube.upload: disabled with that reason.
  const noUpload = destinationOptions({ facebook: true, instagram: true, tiktok: null, youtube: { enabled: false, reason: "Reconnectez YouTube en autorisant la mise en ligne (youtube.upload)." } });
  assert.equal(noUpload.find((o) => o.id === "youtube").available, false);
  assert.match(noUpload.find((o) => o.id === "youtube").reason, /youtube\.upload/);
  assert.deepEqual(ticksToNetworks(["youtube", "facebook"], noUpload), ["facebook"]);
});

// --- Copy per network: facts inserted and checked by code ------------------------

const balkuy = { listingType: "vendre", price: 35_000_000, priceLabel: "35 000 000 FCFA", place: "Balkuy", city: "Ouagadougou", propertyType: "villa" };

test("Facebook: the story, then price, place, phones and roogobf.com each on their own line, 2 or 3 hashtags", () => {
  const out = finalizeNetworkCopy(
    "facebook",
    { text: "Une villa lumineuse pour toute la famille.\nLa cour est prête pour les soirées entre voisins.", hashtags: ["#Roogo"] },
    balkuy,
  );
  const lines = out.text.split("\n");
  assert.ok(lines.includes("Prix : 35 000 000 FCFA"));
  assert.ok(lines.includes("Lieu : Balkuy"));
  assert.ok(lines.includes(CONTACT_LINE));
  assert.equal(lines.at(-1), SITE_LINE);
  assert.ok(out.hashtags.length >= 2 && out.hashtags.length <= 3, out.hashtags.join(" "));
  assert.equal(out.hashtags[0], "#Roogo");
  assert.deepEqual(out.checks.filter((c) => c.level === "error"), []);
  assert.equal(CAPTION_CONTACT, CONTACT_LINE, "one phone line for every caption");
});

test("Instagram keeps 5 to 10 hashtags (topped up with house tags, cut above 10)", () => {
  const few = finalizeNetworkCopy("instagram", { text: "Premier paragraphe.\n\nDeuxième.\n\nÉcrivez-nous sur WhatsApp.", hashtags: ["#Roogo"] }, balkuy);
  assert.ok(few.hashtags.length >= 5 && few.hashtags.length <= 10, few.hashtags.join(" "));
  assert.ok(few.hashtags.includes("#Balkuy"));
  const many = finalizeNetworkCopy("instagram", { text: "Texte.", hashtags: Array.from({ length: 14 }, (_, i) => `#Tag${i}`) }, balkuy);
  assert.equal(many.hashtags.length, 10);
  assert.ok(many.fixes.some((f) => /10/.test(f)));
});

test("TikTok: a short hook that already gives the right price gets no extra price line, 3 to 5 hashtags", () => {
  const out = finalizeNetworkCopy("tiktok", { text: "Ta première maison à Balkuy ? 2 chambres, 35 M.", hashtags: ["#Roogo", "#Balkuy"] }, balkuy);
  assert.ok(!out.text.includes("Prix :"), "the hook already has the price");
  assert.ok(!out.text.includes("Lieu :"), "the hook already names the place");
  assert.ok(out.text.includes(CONTACT_LINE));
  assert.ok(out.hashtags.length >= 3 && out.hashtags.length <= 5);
  assert.deepEqual(out.checks, []);
});

test("a wrong price is flagged as an error; a rental's caution in whole months is not", () => {
  const wrong = finalizeNetworkCopy("tiktok", { text: "Villa à Balkuy, seulement 30 millions !", hashtags: [] }, balkuy);
  const error = wrong.checks.find((c) => c.code === "price");
  assert.equal(error.level, "error");
  assert.match(error.message, /30.000.000 FCFA.*35 000 000 FCFA/);
  const rent = { listingType: "louer", price: 150_000, priceLabel: "150 000 FCFA par mois", place: "Tanghin" };
  const ok = finalizeNetworkCopy("facebook", { text: "Maison à Tanghin. Caution de 450 000 FCFA.", hashtags: [] }, rent);
  assert.equal(ok.checks.find((c) => c.code === "price"), undefined);
});

test("amounts are read as people write them, never confusing m² with millions", () => {
  assert.deepEqual(amountsIn("35 millions"), [35_000_000]);
  assert.deepEqual(amountsIn("35 M."), [35_000_000]);
  assert.deepEqual(amountsIn("Prix : 35 000 000 FCFA"), [35_000_000]);
  assert.deepEqual(amountsIn("150.000 F par mois"), [150_000]);
  assert.deepEqual(amountsIn("1,5 million"), [1_500_000]);
  assert.deepEqual(amountsIn("300 m² et 2 chambres"), []);
});

test("any other phone number is removed and the Roogo line put back; a missing contact or site is restored", () => {
  const out = finalizeNetworkCopy(
    "facebook",
    { text: "Belle villa.\nAppelez Moussa au 70 12 34 56 pour visiter.\nroogo.bf", hashtags: [] },
    balkuy,
  );
  assert.ok(!out.text.includes("70 12 34 56"));
  assert.ok(out.fixes.some((f) => /numéro/.test(f)));
  assert.ok(out.text.includes(CONTACT_LINE));
  assert.equal(out.text.split("\n").filter((l) => l === SITE_LINE).length, 1);
  assert.ok(!/roogo\.bf/.test(out.text));
});

test("house rules: no em dash, at most 3 emoji, never financing on a sale, never « faux »", () => {
  const out = finalizeNetworkCopy("instagram", { text: "Villa neuve — cour immense 🏡🔑🌳💧☀️", hashtags: [] }, balkuy);
  assert.ok(!/[—–]/.test(out.text));
  assert.equal((out.text.match(/\p{Extended_Pictographic}/gu) ?? []).length, 3);
  const credit = finalizeNetworkCopy("facebook", { text: "Villa avec facilités de paiement et crédit possible.", hashtags: [] }, balkuy);
  assert.ok(credit.checks.some((c) => c.code === "financing" && c.level === "error"));
  const rent = finalizeNetworkCopy("facebook", { text: "Maison avec paiement échelonné du loyer.", hashtags: [] }, { ...balkuy, listingType: "louer", price: null, priceLabel: null });
  assert.equal(rent.checks.find((c) => c.code === "financing"), undefined, "financing only matters for sales");
  const faux = finalizeNetworkCopy("facebook", { text: "Salon avec faux plafond.", hashtags: [] }, balkuy);
  assert.ok(faux.checks.some((c) => c.code === "faux"));
});

test("without a linked listing, no price line is invented and a quoted price is only a warning", () => {
  const out = finalizeNetworkCopy("facebook", { text: "Une belle maison, 20 millions.", hashtags: [] });
  assert.ok(!out.text.includes("Prix :"));
  assert.equal(out.checks.find((c) => c.code === "price-unchecked").level, "warning");
  assert.ok(out.text.includes(CONTACT_LINE) && out.text.includes(SITE_LINE));
});

test("« Même texte partout » puts the finalized base on every ticked network", () => {
  const copy = sameTextEverywhere({ text: "Une villa pour grandir en famille.", hashtags: ["#Roogo", "#Balkuy", "#VillaAVendre"] }, ["facebook", "instagram", "tiktok"], balkuy);
  assert.deepEqual(Object.keys(copy), ["facebook", "instagram", "tiktok"]);
  assert.equal(copy.facebook.text, copy.tiktok.text);
  assert.ok(copy.instagram.text.includes("Prix : 35 000 000 FCFA"));
  assert.deepEqual(networkCopyErrors(["facebook", "instagram", "tiktok"], copy, { text: "", hashtags: [] }, balkuy, true), []);
});

test("networkCopyErrors names the network whose text breaks a rule (blocks « Valider » and the publisher)", () => {
  const copy = {
    facebook: finalizeNetworkCopy("facebook", { text: "Villa, 35 millions.", hashtags: [] }, balkuy),
    tiktok: { text: "Villa à 40 millions !\n" + CONTACT_LINE + "\n" + SITE_LINE, hashtags: ["#Roogo", "#Balkuy", "#Ouaga"] },
  };
  const errors = networkCopyErrors(["facebook", "tiktok"], copy, { text: "", hashtags: [] }, balkuy, false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].network, "tiktok");
  assert.match(errors[0].message, /^TikTok : /);
});

test("stored network_copy is read defensively", () => {
  assert.deepEqual(parseNetworkCopy(null), {});
  assert.deepEqual(parseNetworkCopy({ facebook: { text: "A", hashtags: ["roogo", "#Ouaga 2000"] }, myspace: { text: "x" }, tiktok: { text: 3 } }), {
    facebook: { text: "A", hashtags: ["#Roogo", "#Ouaga", "#2000"] },
  });
  assert.equal(copyPostText("Texte", ["#Roogo"]), "Texte\n\n#Roogo");
});

test("the hashtag word rule matches publishing.ts so the two cannot drift", () => {
  for (const word of ["Ouaga 2000", "Saint-Léon", "Zone du Bois", "célibatorium"]) assert.equal(tagWord(word), hashtagWord(word));
});

test("copyProblems: the YouTube title is limited to 100 characters", () => {
  const long = `${"Villa ".repeat(20)}\n${CONTACT_LINE}\n${SITE_LINE}`;
  assert.ok(copyProblems("youtube", long, ["#Roogo", "#Shorts"]).some((c) => c.code === "title"));
});

// --- The model call (mocked) -------------------------------------------------------

test("one model call asks for a base and one version per ticked network, and never for phone or price lines", () => {
  const req = buildNetworkCopyRequest(
    { property: null, title: "Villa Balkuy", note: "", networks: ["facebook", "instagram", "tiktok"], briefs: { base: "B", facebook: "F", instagram: "I", tiktok: "T" } },
    "gpt-5-mini",
  );
  assert.equal(req.model, "gpt-5-mini");
  assert.deepEqual(req.text.format.schema.properties.versions.items.properties.network.enum, ["facebook", "instagram", "tiktok"]);
  const user = JSON.parse(req.input[1].content);
  assert.deepEqual(user.reseaux.map((r) => r.consigne), ["F", "I", "T"]);
  assert.match(req.input[0].content, /N'écris aucun numéro de téléphone/);
  assert.match(req.input[0].content, /comptant/);
});

test("a network the model skipped gets the base text, so every tab has something to edit", () => {
  const response = { output_text: JSON.stringify({ base: { text: "Base", hashtags: ["#Roogo"] }, versions: [{ network: "tiktok", text: "Accroche", hashtags: [] }, { network: "myspace", text: "x", hashtags: [] }] }) };
  const out = parseNetworkCopyOutput(response, ["facebook", "tiktok"]);
  assert.equal(out.versions.tiktok.text, "Accroche");
  assert.equal(out.versions.facebook.text, "Base");
  assert.equal(out.versions.myspace, undefined);
});

test("requestNetworkCopy sends one request with the configured model and reads the answer", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ output_text: JSON.stringify({ base: { text: "Base", hashtags: [] }, versions: [{ network: "facebook", text: "FB", hashtags: [] }] }) }), { status: 200 });
  };
  const out = await requestNetworkCopy({ fetch, apiKey: "test-key", model: "gpt-test" }, { property: null, title: "T", note: "", networks: ["facebook"], briefs: {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "gpt-test");
  assert.equal(out.versions.facebook.text, "FB");
  await assert.rejects(requestNetworkCopy({ fetch, apiKey: undefined }, { property: null, title: "T", note: "", networks: ["facebook"], briefs: {} }), /OPENAI_API_KEY/);
});

// --- Founder-only validation, right after « Valider » ------------------------------

test("only a founder validates; « Dès que Salif valide » publishes at the approval time, a chosen date stays", () => {
  assert.equal(canChangeStatus("staff", "a_valider", "valide"), false);
  assert.equal(canChangeStatus("founder", "a_valider", "valide"), true);
  const now = new Date("2026-10-23T15:04:00.000Z");
  assert.equal(scheduledAtOnApproval({ publish_on_approval: true, scheduled_at: "2026-10-23T09:00:00+00:00" }, now), "2026-10-23T15:04:00.000Z");
  assert.equal(scheduledAtOnApproval({ publish_on_approval: false, scheduled_at: "2026-10-25T19:00:00+00:00" }, now), "2026-10-25T19:00:00.000Z");
});

// --- Independent per-network results and « Réessayer » per network ------------------

test("a failure on one network never blocks the others, and « Réessayer » retries that network only", () => {
  const networks = ["facebook", "instagram", "tiktok"];
  const results = {
    facebook: { status: "published", permalink: "https://facebook.com/1" },
    instagram: { status: "failed", error: "La vidéo n'est pas prête" },
    tiktok: { status: "failed", error: "Jeton expiré" },
  };
  assert.equal(finalStatus(networks, results), "echec");
  const onlyIg = retryResults(networks, results, "instagram");
  assert.equal(onlyIg.error, null);
  assert.deepEqual(networksToPublish(networks, onlyIg.results), ["instagram"]);
  assert.equal(onlyIg.results.tiktok.held, true);
  // After the run nothing stays held: TikTok keeps its own « Réessayer ».
  const after = clearHeld({ ...onlyIg.results, instagram: { status: "published" } });
  assert.equal(after.tiktok.held, undefined);
  assert.deepEqual(networksToPublish(networks, after), ["tiktok"]);
  // Without a network, every failed one is tried again; a published one never.
  assert.deepEqual(networksToPublish(networks, retryResults(networks, results).results), ["instagram", "tiktok"]);
  assert.match(retryResults(networks, results, "facebook").error, /Déjà publiée/);
});

test("Facebook: a video over 90 s goes out as a Page video (Reels stop at 90 s), a shorter one as a Reel", async () => {
  const cfg = { graphVersion: "v25.0", pageId: "PAGE", igUserId: "IG", pageToken: "test-token", needsPageToken: false };
  const run = async (durationSeconds) => {
    const urls = [];
    const deps = {
      sleep: async () => {},
      maxPolls: 2,
      fetch: async (url) => {
        urls.push(url.replace(/\?.*$/, ""));
        const body = url.includes("/videos") ? { id: "VID" } : url.includes("video_reels") ? { video_id: "R1", success: true } : url.includes("rupload") ? { success: true } : { status: { video_status: "ready" }, permalink_url: "https://facebook.com/x" };
        return { ok: true, status: 200, json: async () => body };
      },
    };
    const result = await publishFacebook(deps, cfg, { kind: "video", url: "https://roogobf.com/stream", durationSeconds }, "Texte");
    return { result, urls };
  };
  const long = await run(150);
  assert.equal(long.result.status, "published");
  assert.ok(long.urls.some((u) => u.endsWith("/PAGE/videos")));
  assert.ok(!long.urls.some((u) => u.includes("video_reels")));
  const short = await run(45);
  assert.equal(short.result.status, "published");
  assert.ok(short.urls.some((u) => u.includes("video_reels")));
});

// --- Drive: French name, folders by name, move to « Publié » ------------------------

test("the Drive copy gets a French descriptive name", () => {
  assert.equal(finalVideoDriveName({ title: "Villa Balkuy", date: new Date("2026-10-23T22:10:00Z"), ext: "mp4" }), "Roogo - Villa Balkuy - 2026-10-23.mp4");
  assert.equal(finalVideoDriveName({ title: "Roogo - Duplex / Ouaga 2000 — vue", date: "2026-10-24T08:00:00Z", ext: ".MOV" }), "Roogo - Duplex Ouaga 2000 - vue - 2026-10-24.mov");
  assert.equal(finalVideoDriveName({ title: "", date: "2026-10-24", ext: "mp4" }), "Roogo - Vidéo - 2026-10-24.mp4");
  assert.equal(listingVideoTitle("Villa", "Balkuy", "Ouagadougou"), "Villa Balkuy");
  assert.equal(listingVideoTitle("Terrain", "", "Koudougou"), "Terrain Koudougou");
  assert.equal(titleFromFileName("visite_villa_tanghin.mp4"), "visite villa tanghin");
});

function fakeDrive(tree) {
  const calls = [];
  const list = async (parentId) => {
    calls.push(parentId);
    if (tree === "throw") throw new Error("Drive down");
    return tree[parentId] ?? [];
  };
  return { list, calls };
}

test("the folders are found by name under the shared drive (accents and case ignored)", async () => {
  const drive = fakeDrive({
    DRIVE: [{ id: "f-biens", name: "Biens" }, { id: "f-videos", name: "VIDEOS" }],
    "f-videos": [{ id: "f-old", name: "Vidéo finales" }, { id: "f-final", name: "videos finales" }],
    "f-final": [{ id: "f-pub", name: "Publie" }],
  });
  assert.deepEqual(await resolveFinalVideoFolders(drive.list, "DRIVE"), { finalId: "f-final", publishedId: "f-pub", source: "name" });
});

test("when a name is missing or Drive cannot list, the configured ids are used (env, else the team's folders)", async () => {
  const empty = fakeDrive({ DRIVE: [] });
  assert.deepEqual(await resolveFinalVideoFolders(empty.list, "DRIVE"), {
    finalId: DEFAULT_FINAL_VIDEOS_FOLDER_ID,
    publishedId: DEFAULT_PUBLISHED_VIDEOS_FOLDER_ID,
    source: "config",
  });
  const down = fakeDrive("throw");
  assert.deepEqual(await resolveFinalVideoFolders(down.list, "DRIVE", { STUDIO_FINAL_VIDEOS_FOLDER_ID: "env-final", STUDIO_PUBLISHED_VIDEOS_FOLDER_ID: "env-pub" }), {
    finalId: "env-final",
    publishedId: "env-pub",
    source: "config",
  });
  // « Publié » missing under a folder found by name: the configured « Publié ».
  const noPub = fakeDrive({ DRIVE: [{ id: "v", name: "Videos" }], v: [{ id: "f", name: "Vidéos finales" }] });
  assert.deepEqual(await resolveFinalVideoFolders(noPub.list, "DRIVE"), { finalId: "f", publishedId: DEFAULT_PUBLISHED_VIDEOS_FOLDER_ID, source: "name" });
});

test("the Drive copy moves to « Publié » once, only when the post is out on every network", () => {
  const video = { status: "ready", drive_file_id: "file1", published_folder_at: null };
  const everywhere = { status: "publie", networks: ["facebook", "instagram"], results: { facebook: { status: "published" }, instagram: { status: "published" } } };
  assert.deepEqual(shouldMoveToPublished(video, everywhere), { move: true });
  assert.equal(shouldMoveToPublished(video, { ...everywhere, status: "echec", results: { facebook: { status: "published" }, instagram: { status: "failed" } } }).move, false);
  assert.equal(shouldMoveToPublished({ ...video, published_folder_at: "2026-10-23T10:00:00Z" }, everywhere).reason, "already-moved");
  assert.equal(shouldMoveToPublished({ ...video, status: "uploading", drive_file_id: null }, everywhere).reason, "no-file");
  assert.equal(shouldMoveToPublished(null, everywhere).move, false);
});

test("the uploader reads where the video is", () => {
  assert.equal(uploaderStatus(null, "uploading"), "Envoi en cours");
  assert.equal(uploaderStatus(null, "ready"), "Prête, pas encore envoyée à Salif");
  assert.equal(uploaderStatus({ status: "a_valider" }, "ready"), "À valider par Salif");
  assert.equal(uploaderStatus({ status: "a_faire", returned_at: "2026-10-23" }, "ready"), "À corriger");
  assert.equal(uploaderStatus({ status: "echec" }, "ready"), "Échec sur un réseau");
  assert.equal(uploaderStatus({ status: "publie" }, "ready"), "Publiée partout");
});

// --- Range reads for TikTok (no whole-file buffer) and resumable runs -------------

function rangeServer(size, { ignoreRange = false } = {}) {
  const asked = [];
  let cancelled = 0;
  const fetch = async (url, init) => {
    const range = init.headers.Range;
    asked.push(range);
    const m = /bytes=(\d+)-(\d+)/.exec(range ?? "");
    const whole = ignoreRange || !m;
    const start = whole ? 0 : Number(m[1]);
    const end = whole ? size - 1 : Math.min(Number(m[2]), size - 1);
    const headers = new Map([
      ["content-length", String(end - start + 1)],
      ["content-range", whole ? null : `bytes ${start}-${end}/${size}`],
    ]);
    return {
      ok: true,
      status: whole ? 200 : 206,
      headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
      arrayBuffer: async () => new ArrayBuffer(end - start + 1),
      body: { cancel: async () => void cancelled++ },
    };
  };
  return { fetch, asked, cancelled: () => cancelled };
}

test("rangeSource reads only the asked bytes and learns the size from a 1-byte probe", async () => {
  const server = rangeServer(25 * 1024 * 1024);
  const src = rangeSource(server.fetch, "https://x/stream");
  assert.equal(await src.size(), 25 * 1024 * 1024);
  assert.equal((await src.readRange(10, 19)).byteLength, 10);
  assert.deepEqual(server.asked, ["bytes=0-0", "bytes=10-19"]);
  assert.equal(totalFromContentRange("bytes 0-0/52428800"), 52428800);
  // Known size (final videos): no probe.
  const known = rangeSource(rangeServer(100).fetch, "https://x/stream", 100);
  assert.equal(await known.size(), 100);
});

test("rangeSource refuses a server that ignores Range instead of loading the whole file", async () => {
  const server = rangeServer(500 * 1024 * 1024, { ignoreRange: true });
  const src = rangeSource(server.fetch, "https://x/stream", 500 * 1024 * 1024);
  await assert.rejects(src.readRange(0, 10 * 1024 * 1024 - 1), /par morceaux/);
  assert.equal(server.cancelled(), 1, "the body is cancelled, never read");
});

test("a TikTok upload cut by the deadline keeps the post for the next run; anything else ends the run", () => {
  const resume = { upload_url: "u", next_chunk: 3 };
  assert.equal(continueLater(["facebook", "tiktok"], { facebook: { status: "published" }, tiktok: { status: "pending", resume } }), true);
  assert.equal(continueLater(["facebook", "tiktok"], { facebook: { status: "published" }, tiktok: { status: "pending" } }), false);
  assert.equal(continueLater(["tiktok"], { tiktok: { status: "failed", resume } }), false);
});

// --- YouTube Shorts (2026-10-24) ---------------------------------------------------

test("YouTube copy rules: searchable title on the first line (100 max), description with phones and roogobf.com, 3 to 5 hashtags with #Shorts", () => {
  assert.equal(COPY_RULES.youtube.titleMax, 100);
  assert.equal(COPY_RULES.youtube.hashtagsMin, 3);
  assert.equal(COPY_RULES.youtube.hashtagsMax, 5);
  assert.match(COPY_RULES.youtube.brief, /type de bien, le lieu et le prix/);
  assert.match(COPY_RULES.youtube.brief, /#Shorts/);
  const out = finalizeNetworkCopy(
    "youtube",
    { text: "Titre : Villa à vendre à Balkuy, 35 000 000 FCFA\n\nUne villa lumineuse pour toute la famille.", hashtags: ["#Roogo", "#Balkuy"] },
    balkuy,
  );
  const lines = out.text.split("\n");
  assert.equal(lines[0], "Villa à vendre à Balkuy, 35 000 000 FCFA", "« Titre : » removed");
  assert.ok(lines.includes(CONTACT_LINE));
  assert.equal(lines.at(-1), SITE_LINE);
  assert.ok(!out.text.includes("Prix :"), "the title already gives the right price");
  assert.ok(out.hashtags.includes("#Shorts"));
  assert.ok(out.hashtags.length >= 3 && out.hashtags.length <= 5, out.hashtags.join(" "));
  assert.deepEqual(out.checks, []);
});

test("YouTube: a title over 100 characters is cut at a word; #Shorts survives the cut to 5 hashtags", () => {
  const longTitle = "Magnifique villa familiale de quatre chambres avec piscine et grand jardin arboré à vendre dans le quartier Balkuy";
  const out = finalizeNetworkCopy("youtube", { text: `${longTitle}\nDescription.`, hashtags: ["#A", "#B", "#C", "#D", "#E", "#F"] }, balkuy);
  const title = out.text.split("\n")[0];
  assert.ok(title.length <= 100, `${title.length}`);
  assert.ok(longTitle.startsWith(title));
  assert.ok(!/\s$/.test(title));
  assert.ok(out.fixes.some((f) => /Titre YouTube raccourci/.test(f)));
  assert.equal(out.hashtags.length, 5);
  assert.equal(out.hashtags[0], "#Shorts");
  assert.equal(shortenTitle("court", 100), "court");
});

test("YouTube: a title without the place or the price gets a warning (searchable), never a block", () => {
  const out = finalizeNetworkCopy("youtube", { text: "Une belle maison\nDescription.", hashtags: ["#Roogo", "#Shorts", "#Ouaga"] }, balkuy);
  const codes = out.checks.map((c) => c.code);
  assert.ok(codes.includes("title-place"));
  assert.ok(codes.includes("title-price"));
  assert.deepEqual(out.checks.filter((c) => c.level === "error"), []);
});

test("youtubeShortFields: title = first line, description = the rest with phones, roogobf.com and hashtags, #Shorts always there", () => {
  const final = finalizeNetworkCopy("youtube", { text: "Villa à Balkuy, 35 000 000 FCFA\n\nLa cour est prête.", hashtags: ["#Roogo", "#Balkuy", "#Shorts"] }, balkuy);
  const fields = youtubeShortFields({ text: final.text, hashtags: final.hashtags }, "Villa Balkuy");
  assert.equal(fields.title, "Villa à Balkuy, 35 000 000 FCFA");
  assert.ok(fields.description.startsWith("La cour est prête."));
  assert.ok(fields.description.includes(CONTACT_LINE));
  assert.ok(fields.description.split("\n").includes(SITE_LINE));
  assert.ok(fields.description.endsWith("#Roogo #Balkuy #Shorts"));
  // « Même texte partout »: the base without #Shorts gets it; an empty text falls back to the post title.
  assert.ok(youtubeShortFields({ text: "Base\nSuite", hashtags: ["#Roogo"] }, "T").description.endsWith("#Roogo #Shorts"));
  assert.equal(youtubeShortFields({ text: "", hashtags: [] }, "Villa Balkuy").title, "Villa Balkuy");
  assert.ok([...youtubeShortFields({ text: "x".repeat(140), hashtags: [] }, "T").title].length <= 100);
});

test("the model call includes the YouTube brief when YouTube Shorts is ticked", () => {
  const req = buildNetworkCopyRequest(
    { property: null, title: "Villa Balkuy", note: "", networks: ["facebook", "youtube"], briefs: { base: COPY_RULES.base.brief, facebook: COPY_RULES.facebook.brief, youtube: COPY_RULES.youtube.brief } },
    "gpt-5-mini",
  );
  assert.deepEqual(req.text.format.schema.properties.versions.items.properties.network.enum, ["facebook", "youtube"]);
  const user = JSON.parse(req.input[1].content);
  assert.equal(user.reseaux[1].reseau, "youtube");
  assert.match(user.reseaux[1].consigne, /100 caractères au plus/);
});

test("YouTube is published by the worker, fails on its own, and the Drive copy waits for it", () => {
  const networks = ["facebook", "youtube"];
  assert.deepEqual(networksToPublish(networks, {}), ["facebook", "youtube"]);
  const ytFailed = { facebook: { status: "published" }, youtube: { status: "failed", error: "x" } };
  assert.equal(finalStatus(networks, ytFailed), "echec");
  assert.deepEqual(networksToPublish(networks, ytFailed), ["youtube"], "Facebook is never posted twice");
  const video = { status: "ready", drive_file_id: "file1", published_folder_at: null };
  assert.equal(shouldMoveToPublished(video, { status: "echec", networks, results: ytFailed }).move, false);
  const both = { facebook: { status: "published" }, youtube: { status: "published", permalink: "https://youtube.com/shorts/VID9" } };
  assert.equal(finalStatus(networks, both), "publie");
  assert.deepEqual(shouldMoveToPublished(video, { status: "publie", networks, results: both }), { move: true });
  // A YouTube upload cut by the deadline keeps the post for the next run.
  assert.equal(continueLater(networks, { facebook: { status: "published" }, youtube: { status: "pending", resume: { session_url: "s", next_byte: 1, total: 2 } } }), true);
  // « Réessayer » on YouTube only.
  const plan = retryResults(["facebook", "instagram", "youtube"], { facebook: { status: "failed" }, instagram: { status: "published" }, youtube: { status: "failed" } }, "youtube");
  assert.equal(plan.results.facebook.held, true);
  assert.deepEqual(networksToPublish(["facebook", "instagram", "youtube"], plan.results), ["youtube"]);
});

test("a YouTube quota failure is retried by itself after the reset, at most 3 days in a row", () => {
  const post = (yt, status = "echec") => ({ status, networks: ["facebook", "youtube"], results: { facebook: { status: "published" }, youtube: yt } });
  const now = new Date("2026-10-25T09:00:00Z");
  const quota = { status: "failed", error: "Quota", retry_after: "2026-10-25T08:00:00.000Z" };
  assert.equal(quotaRetryDue(post(quota), now, 3), true);
  assert.equal(quotaRetryDue(post(quota), new Date("2026-10-25T07:59:00Z"), 3), false, "not before the reset");
  assert.equal(quotaRetryDue(post({ ...quota, auto_retries: 3 }), now, 3), false, "then the team uses Réessayer");
  assert.equal(quotaRetryDue(post({ status: "failed", error: "autre" }), now, 3), false, "only quota errors");
  assert.equal(quotaRetryDue(post(quota, "valide"), now, 3), false);
});
