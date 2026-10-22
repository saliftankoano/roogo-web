import test from "node:test";
import assert from "node:assert/strict";
import {
  OUTRO_ONLY_SECONDS,
  buildOutroOnly,
  defaultOutro,
  MIN_OUTRO,
  MAX_SHOT,
  MIN_SHOT,
  buildVisitePov,
  outroStart,
  planShots,
} from "./video-templates.ts";

const SCRIPT =
  "Villa à vendre à Ouagadougou. Un jardin complète la propriété. Contactez l'équipe Roogo pour plus de détails.";

test("the outro starts on the call to action and always keeps enough time", () => {
  const at = outroStart(40, SCRIPT);
  const total = 0.4 + 40 + 1.4;
  assert.ok(at < total - MIN_OUTRO, "starts before the latest point");
  assert.ok(at > 20, "after the description");
  assert.equal(outroStart(40), Math.round((total - MIN_OUTRO) * 100) / 100);
});

test("photos fill the time until the outro, repeating when there are few", () => {
  const shots = planShots(["a", "b"], 21);
  assert.equal(shots[0].start, 0);
  assert.equal(shots.at(-1).end, 21);
  for (const s of shots) {
    const len = s.end - s.start;
    assert.ok(len >= MIN_SHOT - 0.01 && len <= MAX_SHOT + 0.01, `shot length ${len}`);
  }
  assert.deepEqual(
    shots.slice(0, 3).map((s) => s.src),
    ["a", "b", "a"],
  );
  assert.notDeepEqual(shots[0].pan, shots[1].pan, "neighbours move differently");
});

test("the page carries its real length and escapes listing text", () => {
  const { html, durationSeconds } = buildVisitePov({
    photos: ["https://x/p1.jpg"],
    voiceUrl: "https://x/v.mp3",
    voiceSeconds: 30,
    script: SCRIPT,
    logoUrl: "https://x/logo.png",
    outro: {
      headline: "VILLA À VENDRE",
      location: 'Zogona <script>"',
      price: "50 000 000",
      currency: "FCFA",
      phone: "+226 67 00 61 16",
    },
  });
  assert.equal(durationSeconds, 31.8);
  assert.match(html, /data-composition-id="visite-pov"[^>]*data-duration="31.8"/);
  assert.ok(!html.includes('Zogona <script>"'));
  assert.match(html, /Zogona &lt;script&gt;&quot;/);
  assert.match(html, /\+226 67 00 61 16/);
});

test("a voice moved later in the editor pushes the whole video back", () => {
  const base = { photos: ["https://x/p.jpg"], voiceUrl: "https://x/v.mp3", voiceSeconds: 30, logoUrl: "https://x/l.png",
    outro: { headline: "H", location: "L", price: "1", currency: "FCFA" } };
  const later = buildVisitePov({ ...base, voiceDelay: 2 });
  assert.equal(later.durationSeconds, 33.4);
  assert.match(later.html, /id="voice"[^>]*data-start="2"/);
  assert.equal(buildVisitePov({ ...base, voiceDelay: 99 }).durationSeconds, 37.4, "clamped to the maximum");
});

test("the outro text starts from the listing and stays editable", () => {
  const o = defaultOutro({ title: "Villa à vendre, Trame d'accueil", place: "Trame d'accueil, Ouagadougou", price: "50 000 000 FCFA", image: "https://x/p.jpg" }, "+226 67 00 61 16");
  assert.equal(o.headline, "VILLA À VENDRE");
  assert.equal(o.price, "50 000 000");
  assert.equal(o.currency, "FCFA");
  assert.equal(o.backgroundUrl, "https://x/p.jpg");
});

test("an outro on its own has no photos, watermark or voice", () => {
  const { html, durationSeconds } = buildOutroOnly({
    outro: { headline: "VILLA", location: "Zogona", price: "1", currency: "FCFA", phone: "+226 67 00 61 16", backgroundUrl: null },
    logoUrl: "https://x/l.png",
  });
  assert.equal(durationSeconds, OUTRO_ONLY_SECONDS);
  assert.ok(!html.includes('id="wm"'));
  assert.ok(!html.includes('id="voice"'));
  assert.ok(!html.includes('class="clip shot"'));
  assert.match(html, /tl.set\("#outro", \{ opacity: 1 \}, 0\)/);
});

test("downloaded videos get a readable French title", async () => {
  const { videoDownloadName } = await import("./video-templates.ts");
  assert.equal(videoDownloadName("Visite POV · Maison à vendre, Koubri"), "Roogo - Maison à vendre, Koubri - Visite du bien.mp4");
  assert.equal(videoDownloadName("Fin seule · Villa à vendre, Balkuy"), "Roogo - Villa à vendre, Balkuy - Fin de vidéo.mp4");
  assert.equal(videoDownloadName("", "Fin seule"), "Roogo - Fin de vidéo.mp4");
  assert.equal(videoDownloadName("Visite POV · Terrain: R+1 / Tanghin"), "Roogo - Terrain R 1 Tanghin - Visite du bien.mp4");
});

test("music runs the whole video: low under the voice, up when nobody speaks, faded on the end", async () => {
  const { musicEnvelope, musicLevelAt, MUSIC_ALONE, MUSIC_UNDER_VOICE, buildVisitePov, buildOutroOnly, defaultOutro } =
    await import("./video-templates.ts");
  const points = musicEnvelope(30, { start: 1.5, end: 25 });
  assert.equal(points[0].t, 0);
  assert.equal(points[0].v, 0);
  assert.equal(points.at(-1).t, 30);
  assert.equal(points.at(-1).v, 0);
  assert.equal(musicLevelAt(points, 1), MUSIC_ALONE);
  assert.equal(musicLevelAt(points, 12), MUSIC_UNDER_VOICE);
  assert.equal(musicLevelAt(points, 27), MUSIC_ALONE, "heard clearly after the voice");
  assert.ok(musicLevelAt(points, 29.5) < MUSIC_ALONE, "fading out at the very end");
  for (let i = 1; i < points.length; i++) assert.ok(points[i].t > points[i - 1].t);

  const alone = musicEnvelope(6, null);
  assert.equal(musicLevelAt(alone, 3), MUSIC_ALONE, "an outro on its own keeps the song up");

  const outro = defaultOutro({ title: "Maison à vendre, Koubri", place: "Koubri, Ouagadougou", price: "15 000 000 FCFA", image: null }, "+226 67 00 61 16");
  const full = buildVisitePov({ photos: ["https://x/a.jpg"], voiceUrl: "https://x/v.mp3", voiceSeconds: 20, musicUrl: "https://x/m.mp3", logoUrl: "https://x/l.png", outro });
  const tag = full.html.match(/<audio id="music"[^>]*>/)[0];
  assert.match(tag, new RegExp(`data-duration="${full.durationSeconds}"`));
  assert.match(tag, /data-automation='\{"version":1,"lanes":\[\{"target":"volume","points":\[/);
  const only = buildOutroOnly({ outro, logoUrl: "https://x/l.png", musicUrl: "https://x/m.mp3" });
  assert.match(only.html, /<audio id="music"/);
  assert.doesNotMatch(buildOutroOnly({ outro, logoUrl: "https://x/l.png" }).html, /id="music"/);
});

test("without a voice-over the music carries the video, at the level the team sets (Salif, 2026-10-11)", async () => {
  const { buildVisitePov, silentTiming, SILENT_SHOT, MUSIC_SOLO, musicEnvelope, musicLevelAt, clampMusicLevel, clampVoiceLevel, defaultOutro, OUTRO_ONLY_SECONDS } =
    await import("./video-templates.ts");
  const outro = defaultOutro({ title: "Villa à vendre, Ouaga 2000", place: "Ouaga 2000", price: "400 000 000 FCFA", image: null }, "+226 67 00 61 16");
  const photos = ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg", "https://x/4.jpg"];

  const timing = silentTiming(4);
  assert.equal(timing.outroFrom, Math.round(4 * SILENT_SHOT * 100) / 100);
  assert.equal(timing.total, Math.round((timing.outroFrom + OUTRO_ONLY_SECONDS) * 100) / 100);

  const silent = buildVisitePov({ photos, voiceUrl: "", voiceSeconds: 0, musicUrl: "https://x/song.mp3", logoUrl: "https://x/l.png", outro });
  assert.equal(silent.durationSeconds, timing.total);
  assert.equal(silent.shots.length, 4, "each photo once");
  assert.doesNotMatch(silent.html, /id="voice"/);
  const lane = JSON.parse(silent.html.match(/data-automation='([^']+)'/)[1]);
  const mid = musicLevelAt(lane.lanes[0].points, timing.total / 2);
  assert.equal(mid, MUSIC_SOLO, "no ducking and near full level by default");

  const quieter = buildVisitePov({ photos, voiceUrl: "", voiceSeconds: 0, musicUrl: "https://x/song.mp3", musicLevel: 0.5, logoUrl: "https://x/l.png", outro });
  const quietLane = JSON.parse(quieter.html.match(/data-automation='([^']+)'/)[1]);
  assert.equal(musicLevelAt(quietLane.lanes[0].points, timing.total / 2), 0.5);

  // With a voice: the team's level is the level when nobody speaks; under the voice it keeps a quarter.
  const points = musicEnvelope(30, { start: 1.5, end: 25 }, 0.6);
  assert.equal(musicLevelAt(points, 27), 0.6);
  assert.equal(musicLevelAt(points, 12), 0.15);

  const loudVoice = buildVisitePov({ photos, voiceUrl: "https://x/v.mp3", voiceSeconds: 20, voiceLevel: 1.5, logoUrl: "https://x/l.png", outro });
  assert.match(loudVoice.html, /<audio id="voice"[^>]*data-volume="3.3"/);

  assert.equal(clampMusicLevel(4), 1);
  assert.equal(clampMusicLevel(-1), 0);
  assert.equal(clampVoiceLevel(9), 2);
  assert.equal(clampVoiceLevel(Number.NaN), 1);
});

test("the outro takes an optional second number, stacked under the first (Salif, 2026-10-11)", async () => {
  const { buildOutroOnly, defaultOutro } = await import("./video-templates.ts");
  const base = defaultOutro({ title: "Villa à vendre, Balkuy", place: "Balkuy", price: "40 000 000 FCFA", image: null }, "+226 67 00 61 16");
  assert.equal(base.phone2, "", "empty by default");
  const one = buildOutroOnly({ outro: base, logoUrl: "https://x/l.png" }).html;
  assert.equal((one.match(/class="phone-pill"/g) ?? []).length, 1);
  assert.doesNotMatch(one, /contact two/);
  const two = buildOutroOnly({ outro: { ...base, phone2: "+226 53 11 11 19" }, logoUrl: "https://x/l.png" }).html;
  assert.equal((two.match(/class="phone-pill"/g) ?? []).length, 2);
  assert.match(two, /class="line contact two"/);
  assert.match(two, /\+226 53 11 11 19/);
  const onlySecond = buildOutroOnly({ outro: { ...base, phone: "", phone2: "+226 53 11 11 19" }, logoUrl: "https://x/l.png" }).html;
  assert.equal((onlySecond.match(/class="phone-pill"/g) ?? []).length, 1, "a lone second number shows as the number");
});

/* ---------- Présentateur dans le coin (Ablassé, 2026-10-11) ---------- */

test("presenter video: the presenter clip sets the length, the outro follows", async () => {
  const { planPresenterVideo, PRESENTER_START, PRESENTER_TAIL, OUTRO_ONLY_SECONDS, CROSSFADE } = await import("./video-templates.ts");
  const plan = planPresenterVideo(90, 40);
  assert.equal(plan.presenterStart, PRESENTER_START);
  assert.equal(plan.presenterEnd, Math.round((PRESENTER_START + 40) * 100) / 100);
  assert.equal(plan.outroFrom, Math.round((plan.presenterEnd + PRESENTER_TAIL) * 100) / 100);
  assert.equal(plan.total, Math.round((plan.outroFrom + OUTRO_ONLY_SECONDS) * 100) / 100);
  // A longer walkthrough is cut once the outro covers it.
  assert.equal(plan.walk.length, 1);
  assert.equal(plan.looped, false);
  assert.equal(plan.walk[0].duration, Math.round((plan.outroFrom + CROSSFADE / 2) * 100) / 100);
});

test("presenter video: a short walkthrough loops back to back until the outro", async () => {
  const { planPresenterVideo, CROSSFADE } = await import("./video-templates.ts");
  const plan = planPresenterVideo(12, 40);
  const needed = Math.round((plan.outroFrom + CROSSFADE / 2) * 100) / 100;
  assert.equal(plan.looped, true);
  assert.equal(plan.walk[0].start, 0);
  for (let i = 1; i < plan.walk.length; i++) {
    const prev = plan.walk[i - 1];
    assert.equal(plan.walk[i].start, Math.round((prev.start + prev.duration) * 100) / 100, "no gap, no overlap");
    assert.ok(prev.duration === 12, "every loop but the last plays the whole clip");
  }
  const last = plan.walk.at(-1);
  assert.ok(Math.abs(last.start + last.duration - needed) < 0.011, "the last loop ends where the outro covers it");
  assert.ok(last.duration <= 12);
});

test("presenter window: bottom-right by default, about a third of the width, clear of the badge and inside the frame", async () => {
  const { presenterRect, rectsOverlap, BADGE_BOX, PRESENTER_LAYOUT, VIDEO_SIZE } = await import("./video-templates.ts");
  const box = presenterRect();
  assert.equal(PRESENTER_LAYOUT.corner, "bottom-right");
  assert.equal(box.w, Math.round(1080 * 0.32));
  assert.ok(box.x + box.w <= VIDEO_SIZE.width - 40, "side margin");
  assert.ok(box.y + box.h <= VIDEO_SIZE.height - 250, "clear of the bottom captions zone");
  assert.ok(!rectsOverlap(box, BADGE_BOX));
  for (const corner of ["bottom-left", "top-left", "top-right"]) {
    const other = presenterRect({ corner });
    assert.ok(!rectsOverlap(other, BADGE_BOX), `${corner} stays clear of the badge`);
    assert.ok(other.x >= 0 && other.y >= 0 && other.x + other.w <= 1080 && other.y + other.h <= 1920, `${corner} inside the frame`);
  }
});

test("presenter video: music sits under the presenter from the start, rises after, fades out", async () => {
  const { planPresenterVideo, presenterMusicEnvelope, musicLevelAt, MUSIC_ALONE, MUSIC_UNDER_VOICE } = await import("./video-templates.ts");
  const plan = planPresenterVideo(60, 30);
  const points = presenterMusicEnvelope(plan);
  assert.equal(points[0].v, 0);
  assert.equal(musicLevelAt(points, 10), MUSIC_UNDER_VOICE);
  assert.equal(musicLevelAt(points, 1.2), MUSIC_UNDER_VOICE, "never swells before the presenter speaks");
  assert.equal(musicLevelAt(points, plan.outroFrom + 1.5), MUSIC_ALONE);
  assert.equal(points.at(-1).t, plan.total);
  assert.equal(points.at(-1).v, 0);
  for (let i = 1; i < points.length; i++) assert.ok(points[i].t > points[i - 1].t);
});

test("presenter page: silent full-frame walkthrough, presenter with sound in a window, same outro", async () => {
  const { buildPresenterCorner, defaultOutro } = await import("./video-templates.ts");
  const outro = defaultOutro({ title: "Villa à vendre, Koubri", place: "Koubri", price: "15 000 000 FCFA", image: null }, "+226 67 00 61 16");
  const { html, durationSeconds, plan } = buildPresenterCorner({
    walkthroughUrl: "https://x/walk.mp4?sig=a&b=1",
    walkthroughSeconds: 10,
    presenterSeconds: 25,
    presenterUrl: "https://x/talk.mp4",
    musicUrl: "https://x/m.mp3",
    logoUrl: "https://x/l.png",
    voiceLevel: 1.5,
    outro,
  });
  assert.equal(durationSeconds, plan.total);
  assert.match(html, new RegExp(`data-composition-id="presentateur-coin"[^>]*data-duration="${plan.total}"`));
  assert.match(html, /window.__timelines\["presentateur-coin"\] = tl;/);
  const walks = html.match(/<video id="walk-\d+"[^>]*>/g);
  assert.equal(walks.length, plan.walk.length);
  for (const tag of walks) {
    assert.match(tag, /\bmuted\b/);
    assert.match(tag, /src="https:\/\/x\/walk.mp4\?sig=a&amp;b=1"/, "URLs are escaped");
    assert.doesNotMatch(tag, /crossorigin/);
  }
  const presenter = html.match(/<video id="presenter"[^>]*>/)[0];
  assert.match(presenter, /data-has-audio="true"/);
  assert.doesNotMatch(presenter, /muted/);
  assert.match(presenter, /data-volume="1.5"/);
  assert.match(presenter, /data-duration="25"/);
  // The window is not timed itself, so the timed video inside it is seek-safe.
  assert.match(html, /<div id="pip" class="pip">/);
  assert.match(html, /id="wm" class="clip"/, "Roogo badge as in Visite POV");
  assert.match(html, /<section id="outro"/);
  assert.match(html, /<audio id="music"[^>]*data-automation=/);
  assert.doesNotMatch(html, /id="voice"/);
  assert.doesNotMatch(html, /class="clip shot"/);
  assert.doesNotMatch(html, /\.play\(|\.pause\(|currentTime/, "HyperFrames owns playback");
});

test("titles and file names for presenter videos", async () => {
  const { videoArtifactTitle, videoDownloadName, isVideoTemplateId, readyVideoClips } = await import("./video-templates.ts");
  assert.equal(videoArtifactTitle({ mode: "full", template: "presentateur-coin" }), "Vidéo du bien (Présentateur)");
  assert.equal(videoArtifactTitle({ mode: "full" }), "Vidéo du bien (Visite POV)");
  assert.equal(videoArtifactTitle({ mode: "outro", template: "presentateur-coin" }), "Fin seule");
  assert.equal(
    videoDownloadName("Présentateur · Villa à vendre, Koubri"),
    "Roogo - Villa à vendre, Koubri - Visite avec présentateur.mp4",
  );
  assert.equal(videoDownloadName("", "Vidéo du bien (Présentateur)"), "Roogo - Visite avec présentateur.mp4");
  assert.ok(isVideoTemplateId("presentateur-coin"));
  assert.ok(!isVideoTemplateId("autre"));

  const base = { mimeType: "video/mp4", sizeBytes: 1, driveFileId: "d" };
  const clips = readyVideoClips([
    { ...base, id: "a", kind: "video", fileName: "a.mp4", durationSeconds: 30, status: "ready", createdAt: "2026-10-10" },
    { ...base, id: "b", kind: "video", fileName: "b.mp4", durationSeconds: 20, status: "ready", createdAt: "2026-10-12" },
    { ...base, id: "c", kind: "photo", fileName: "c.jpg", durationSeconds: null, status: "ready", createdAt: "2026-10-12" },
    { ...base, id: "d", kind: "video", fileName: "d.mp4", durationSeconds: 20, status: "uploading", createdAt: "2026-10-12" },
    { ...base, id: "e", kind: "video", fileName: "e.mp4", durationSeconds: null, status: "ready", createdAt: "2026-10-12" },
  ]);
  assert.deepEqual(clips.map((c) => c.id), ["b", "a"]);
});
