// Studio video templates. Pure, so they can be tested and rendered locally.
//
// A template turns a listing (photos, price, place) and an approved voice-over
// into one self-contained HyperFrames page. Every timing is written into the
// page, because a HyperFrames composition's length is read from the markup
// before any script runs. The page is then rendered in the HeyGen cloud.

export type VideoTemplateId = "visite-pov";

export const VIDEO_TEMPLATES: { id: VideoTemplateId; label: string; description: string }[] = [
  {
    id: "visite-pov",
    label: "Visite POV",
    description:
      "Les photos du bien comme une visite, la voix off, puis le prix et le numéro à appeler.",
  },
];

export const VIDEO_SIZE = { width: 1080, height: 1920, fps: 30 } as const;

/** The crossfade between two photos, in seconds. */
export const CROSSFADE = 0.4;
/** Silence before the voice starts, and after it ends. */
export const VOICE_DELAY = 0.4;
/** Staff can slide the voice later in the editor, up to this many seconds. */
export const MAX_VOICE_DELAY = 6;

export function clampVoiceDelay(value: number): number {
  return Math.round(Math.min(MAX_VOICE_DELAY, Math.max(0, value)) * 10) / 10;
}
export const TAIL = 1.4;
/** Studio voices come out quiet (about -27 dB mean); this lifts them to the usual level. */
export const VOICE_GAIN = 2.2;
/** The outro needs this long on screen to finish its animation. */
export const MIN_OUTRO = 5;
/** A photo should stay between these lengths; longer gets boring, shorter feels rushed. */
export const MIN_SHOT = 2.4;
export const MAX_SHOT = 4.5;

export type Shot = {
  src: string;
  start: number;
  end: number;
  zoom: [number, number];
  pan: [number, number];
  y: number;
  chip: string | null;
};

export type VisitePovInput = {
  photos: string[];
  /** Short facts shown over the photos, in order (price, size, rooms...). */
  chips?: string[];
  voiceUrl: string;
  voiceSeconds: number;
  /** When the voice starts, in seconds (moved in the editor). Defaults to VOICE_DELAY. */
  voiceDelay?: number;
  /** The script that was spoken, used to start the outro on the call to action. */
  script?: string;
  musicUrl?: string | null;
  musicVolume?: number;
  logoUrl: string;
  outro: {
    headline: string;
    location: string;
    price: string;
    currency: string;
    note?: string;
    contactLabel?: string;
    phone?: string;
    footer?: string;
    backgroundUrl?: string | null;
  };
};

// Slow camera moves, cycled so two neighbouring photos never move the same way.
const MOVES: { zoom: [number, number]; pan: [number, number] }[] = [
  { zoom: [1.0, 1.14], pan: [0.55, 0.45] },
  { zoom: [1.05, 1.16], pan: [0.35, 0.15] },
  { zoom: [1.0, 1.12], pan: [0.75, 0.45] },
  { zoom: [1.05, 1.15], pan: [0.3, 0.6] },
  { zoom: [1.02, 1.12], pan: [0.45, 0.55] },
];

const CTA_MARKERS = [
  "contactez",
  "appelez",
  "écrivez",
  "ecrivez",
  "avec roogo",
  "avec rohgo",
  "pour visiter",
];

/**
 * Outro colors (council pick "D", approved by Salif 2026-10-10): the phone pill
 * stays the only filled orange; orange appears once more as text on the small
 * label; white is kept for the place and the price; supporting lines are dimmed.
 */
export const OUTRO_COLORS = {
  label: "#f5a36a",
  support: "rgba(244, 232, 215, 0.72)",
  rule: "rgba(244, 232, 215, 0.35)",
} as const;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * When the outro starts: at the call to action if the script has one,
 * estimated from where it sits in the text, otherwise near the end. Always
 * leaves the outro at least MIN_OUTRO seconds.
 */
export function outroStart(voiceSeconds: number, script?: string, voiceDelay = VOICE_DELAY): number {
  const total = voiceDelay + voiceSeconds + TAIL;
  const latest = total - MIN_OUTRO;
  let at = latest;
  if (script) {
    const lower = script.toLowerCase();
    const positions = CTA_MARKERS.map((m) => lower.indexOf(m)).filter((i) => i > 0);
    if (positions.length) {
      const fraction = Math.min(...positions) / lower.length;
      at = Math.min(latest, voiceDelay + voiceSeconds * fraction);
    }
  }
  return round(Math.max(MIN_SHOT, at));
}

/**
 * Lays the photos out until the outro. Too few photos for the time: they are
 * shown again, with a different move. Too many: the extra ones are dropped.
 */
export function planShots(photos: string[], until: number, chips: string[] = []): Shot[] {
  if (!photos.length) return [];
  const ideal = (MIN_SHOT + MAX_SHOT) / 2;
  const count = Math.max(1, Math.round(until / ideal));
  const length = until / count;
  return Array.from({ length: count }, (_, i) => {
    const move = MOVES[i % MOVES.length];
    return {
      src: photos[i % photos.length],
      start: round(i * length),
      end: round(i === count - 1 ? until : (i + 1) * length),
      zoom: move.zoom,
      pan: move.pan,
      y: 0.55,
      chip: chips[i] ?? null,
    };
  });
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const n = (value: number) => String(round(value));

export type OutroText = VisitePovInput["outro"];

/** An outro on its own lasts this long: the animation (about 3 s) plus a hold to read the number. */
export const OUTRO_ONLY_SECONDS = 6;

/**
 * The outro's default text, from the listing. Staff can change every line in
 * the editor; "VILLA À VENDRE, Trame d'accueil" -> label "VILLA À VENDRE".
 */
export function defaultOutro(
  property: { title: string; place: string; price: string; image: string | null },
  phone: string,
): OutroText {
  const match = property.price.match(/^(.*?)\s*(FCFA.*)$/i);
  return {
    headline: (property.title.split(",")[0] ?? "").trim().toUpperCase(),
    location: property.place,
    price: match ? match[1].trim() : property.price,
    currency: match ? match[2].trim().toUpperCase() : "",
    note: "",
    contactLabel: "Appelez ou écrivez-nous sur WhatsApp",
    phone,
    footer: "roogobf.com",
    backgroundUrl: property.image,
  };
}

/**
 * Only the outro, to put at the end of a video filmed in person (Salif,
 * 2026-10-10). Same design as the full template, no watermark, no voice.
 */
export function buildOutroOnly(input: {
  outro: OutroText;
  logoUrl: string;
  musicUrl?: string | null;
  musicVolume?: number;
  seconds?: number;
}): { html: string; durationSeconds: number } {
  const total = round(input.seconds ?? OUTRO_ONLY_SECONDS);
  const { html } = compose(
    { ...input, photos: [], voiceUrl: "", voiceSeconds: 0 },
    { total, outroFrom: CROSSFADE / 2, shots: [], delay: null },
  );
  return { html, durationSeconds: total };
}

export function buildVisitePov(input: VisitePovInput): {
  html: string;
  durationSeconds: number;
  shots: Shot[];
} {
  const delay = clampVoiceDelay(input.voiceDelay ?? VOICE_DELAY);
  const total = round(delay + input.voiceSeconds + TAIL);
  const outroFrom = outroStart(input.voiceSeconds, input.script, delay);
  const shots = planShots(input.photos, outroFrom, input.chips);
  return compose(input, { total, outroFrom, shots, delay });
}

function compose(
  input: VisitePovInput,
  plan: { total: number; outroFrom: number; shots: Shot[]; delay: number | null },
): { html: string; durationSeconds: number; shots: Shot[] } {
  const { total, outroFrom, shots, delay } = plan;
  const o = input.outro;
  const XF = CROSSFADE;

  const shotHtml = shots
    .map((s, i) => {
      const a = Math.max(0, s.start - XF / 2);
      const b = i === shots.length - 1 ? outroFrom + XF / 2 : s.end + XF / 2;
      return `      <div id="shot-${i}" class="clip shot" style="z-index:${i + 1}" data-start="${n(a)}" data-duration="${n(b - a)}">
        <img id="img-${i}" src="${esc(s.src)}" alt="">${s.chip ? `\n        <div id="chip-${i}" class="chip">${esc(s.chip)}</div>` : ""}
      </div>`;
    })
    .join("\n");

  const shotTweens = shots
    .map((s, i) => {
      const a = Math.max(0, s.start - XF / 2);
      const b = i === shots.length - 1 ? outroFrom + XF / 2 : s.end + XF / 2;
      const lines = [
        i === 0
          ? `tl.set("#shot-0", { opacity: 1 }, 0);`
          : `tl.fromTo("#shot-${i}", { opacity: 0 }, { opacity: 1, duration: ${XF}, ease: "none" }, ${n(a)});`,
        `tl.fromTo("#img-${i}", { scale: ${s.zoom[0]}, objectPosition: "${s.pan[0] * 100}% ${s.y * 100}%" }, { scale: ${s.zoom[1]}, objectPosition: "${s.pan[1] * 100}% ${s.y * 100}%", duration: ${n(b - a)}, ease: "sine.inOut" }, ${n(a)});`,
      ];
      if (s.chip) {
        lines.push(
          `tl.fromTo("#chip-${i}", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, ${n(s.start + 0.15)});`,
        );
      }
      return "        " + lines.join("\n        ");
    })
    .join("\n");

  const outroAt = outroFrom - XF / 2;
  const priceSize =
    o.price.length > 10 ? Math.max(96, Math.floor(1500 / o.price.length)) : 150;
  const music = input.musicUrl
    ? `\n      <audio id="music" src="${esc(input.musicUrl)}" data-start="0" data-duration="${n(total)}" data-volume="${input.musicVolume ?? 0.09}" data-fade-in="1.2" data-fade-out="1.6"></audio>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=${VIDEO_SIZE.width}, height=${VIDEO_SIZE.height}">
    <title>Roogo ${shots.length ? "Visite POV" : "Fin de vidéo"}</title>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Urbanist:wght@700&display=block" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: #111; }
      #root { position: relative; width: ${VIDEO_SIZE.width}px; height: ${VIDEO_SIZE.height}px; overflow: hidden; font-family: "Nunito", sans-serif; }
      .clip { position: absolute; inset: 0; }
      .shot { overflow: hidden; opacity: 0; }
      .shot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .chip { position: absolute; left: 50%; top: 1180px; transform: translateX(-50%); background: rgba(201,106,46,.96); color: #fff;
        border-radius: 999px; padding: 22px 48px; font: 700 58px/1.15 "Urbanist", sans-serif; white-space: nowrap; box-shadow: 4px 8px 0 rgba(0,0,0,.27); opacity: 0; }
      #wm { z-index: 50; pointer-events: none; }
      #wm .badge { position: absolute; top: 90px; right: 68px; width: 116px; height: 116px; border-radius: 50%; background: rgba(255,255,255,.92);
        display: flex; align-items: center; justify-content: center; }
      #wm img, .logo-badge img { object-fit: contain; }
      #wm img { width: 84px; height: 84px; }
      #outro { z-index: 60; opacity: 0; background: linear-gradient(180deg, #cb7215 0%, #a85c0e 100%); }
      #outro-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(43,36,29,.55) 0%, rgba(43,36,29,.78) 45%, rgba(43,36,29,.92) 100%); }
      .logo-glow { position: absolute; left: 50%; top: 300px; width: 440px; height: 440px; transform: translate(-50%,-50%);
        background: radial-gradient(circle, rgba(255,255,255,.45) 0%, rgba(255,255,255,0) 70%); border-radius: 50%; opacity: 0; }
      .logo-badge { position: absolute; left: 50%; top: 300px; width: 180px; height: 180px; transform: translate(-50%,-50%); background: #fff;
        border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; }
      .logo-badge img { width: 124px; height: 124px; }
      .line { position: absolute; left: 0; right: 0; text-align: center; padding: 0 60px; opacity: 0; }
      .headline { top: 560px; font-size: 38px; font-weight: 800; color: ${o.backgroundUrl ? OUTRO_COLORS.label : "#ffffff"}; letter-spacing: 6px; }
      .location { top: 615px; font-size: 64px; font-weight: 900; color: #fff; }
      .price { top: 760px; color: #fff; padding: 0 30px; }
      .amount { display: block; font-size: ${priceSize}px; font-weight: 900; letter-spacing: 1px; line-height: 1; }
      .currency { display: block; font-size: 48px; font-weight: 800; color: ${OUTRO_COLORS.support}; letter-spacing: 6px; margin-top: 14px; }
      .rule { position: absolute; left: 50%; top: 1000px; width: 130px; height: 4px; margin-left: -65px; border-radius: 4px; background: ${OUTRO_COLORS.rule}; opacity: 0; }
      .note { top: 1026px; font-size: 36px; font-weight: 700; color: ${OUTRO_COLORS.support}; }
      .contact { top: 1300px; }
      .contact-label { font-size: 38px; font-weight: 800; color: ${OUTRO_COLORS.support}; }
      .phone-pill { display: inline-block; margin-top: 26px; background: ${o.backgroundUrl ? "#cb7215" : "#2b241d"}; border-radius: 100px;
        padding: 26px 60px; font-size: 80px; font-weight: 900; color: #fff; letter-spacing: 2px; line-height: 1; }
      .footer { top: 1760px; font-size: 34px; font-weight: 800; color: ${OUTRO_COLORS.support}; letter-spacing: 1px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="visite-pov" data-start="0" data-width="${VIDEO_SIZE.width}" data-height="${VIDEO_SIZE.height}" data-duration="${n(total)}">
${shotHtml}${
        shots.length
          ? `\n      <div id="wm" class="clip" data-start="0" data-duration="${n(outroFrom + XF / 2)}">\n        <div class="badge"><img src="${esc(input.logoUrl)}" alt=""></div>\n      </div>`
          : ""
      }
      <section id="outro" class="clip" data-start="${n(outroAt)}" data-duration="${n(total - outroAt)}">${
        o.backgroundUrl
          ? `\n        <img id="outro-photo" src="${esc(o.backgroundUrl)}" alt="">\n        <div class="shade"></div>`
          : ""
      }
        <div id="logo-glow" class="logo-glow"></div>
        <div id="logo-badge" class="logo-badge"><img src="${esc(input.logoUrl)}" alt="Roogo"></div>
        <div id="headline" class="line headline">${esc(o.headline)}</div>
        <div id="location" class="line location">${esc(o.location)}</div>${
          o.price
            ? `\n        <div id="price" class="line price"><span class="amount">${esc(o.price)}</span><span class="currency">${esc(o.currency)}</span></div>`
            : ""
        }
        <div id="rule" class="rule"></div>${o.note ? `\n        <div id="note" class="line note">${esc(o.note)}</div>` : ""}${
          o.phone
            ? `\n        <div id="contact" class="line contact"><div class="contact-label">${esc(o.contactLabel ?? "Appelez ou écrivez-nous sur WhatsApp")}</div><div class="phone-pill">${esc(o.phone)}</div></div>`
            : ""
        }
        <div id="footer" class="line footer">${esc(o.footer ?? "roogobf.com")}</div>
      </section>
${
        delay !== null
          ? `      <audio id="voice" src="${esc(input.voiceUrl)}" data-start="${n(delay)}" data-duration="${n(total - delay)}" data-volume="${VOICE_GAIN}"></audio>`
          : ""
      }${music}
      <script>
        const tl = gsap.timeline({ paused: true });
${shotTweens}
        const o = ${n(outroAt)};
        ${shots.length ? `tl.fromTo("#outro", { opacity: 0 }, { opacity: 1, duration: ${XF}, ease: "none" }, o);` : `tl.set("#outro", { opacity: 1 }, 0);`}
        tl.fromTo("#logo-glow", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" }, o + 0.1);
        tl.to("#logo-glow", { opacity: 0, scale: 1.6, duration: 1.0, ease: "power2.out" }, o + 0.65);
        tl.fromTo("#logo-badge", { opacity: 0 }, { opacity: 1, duration: 0.55, ease: "power2.out" }, o + 0.15);
        tl.fromTo("#headline", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, o + 0.6);
        tl.fromTo("#location", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, o + 0.75);${
          o.price
            ? `\n        tl.fromTo("#price", { opacity: 0, scale: 0.7, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.8)" }, o + 1.05);`
            : ""
        }
        tl.fromTo("#rule", { opacity: 0, scaleX: 0.3 }, { opacity: 1, scaleX: 1, duration: 0.45, ease: "power3.out" }, o + 1.4);${o.note ? `\n        tl.fromTo("#note", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, o + 1.5);` : ""}${
          o.phone
            ? `\n        tl.fromTo("#contact", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55, ease: "back.out(1.6)" }, o + 2.0);`
            : ""
        }
        tl.fromTo("#footer", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, o + 2.5);${
          o.backgroundUrl
            ? `\n        tl.fromTo("#outro-photo", { scale: 1.0 }, { scale: 1.06, duration: ${n(total - outroAt)}, ease: "none" }, o);`
            : ""
        }
        window.__timelines = window.__timelines || {};
        window.__timelines["visite-pov"] = tl;
        tl.seek(0);
      </script>
    </div>
  </body>
</html>
`;

  return { html, durationSeconds: total, shots };
}
