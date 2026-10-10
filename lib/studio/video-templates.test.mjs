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
