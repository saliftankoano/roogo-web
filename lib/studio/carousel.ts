// Educational social carousels (2026-10-21): the pure rules, no database and
// no network, so they can be tested directly.
//
// A carousel is one `carrousel.json` object, the same file the social-carousels
// skill builds (roogo-skills: skills/social-carousels/references/content-format.md).
// It is the source: every slide's text, photo, framing and darkening, plus the
// logo, colours and fonts. Rendered JPEG slides are outputs, rebuilt from it
// after any change (Salif: "modular, not fixed assets").

export const SLIDE_TYPES = ["cover", "point", "roogo", "cta"] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;
export const MIN_SLIDES = 2;
/** Instagram publishes 2 to 10 images per carousel from the API. */
export const MAX_PUBLISHED_SLIDES = 10;
export const MAX_SLIDES = MAX_PUBLISHED_SLIDES;
export const WORD_TARGET = 30;

export type PhotoTreatment = { saturation?: number; brightness?: number; shade?: number };

export type CarouselSlide = {
  type: SlideType;
  label?: string;
  photo: string;
  photo_position?: string;
  photo_treatment?: PhotoTreatment;
  photo_source?: "real" | "generated";
  title: string;
  subtitle?: string;
  swipe?: string;
  number?: number | string;
  action?: string;
  action_label?: string;
  steps?: string[];
  actions?: Array<{ icon?: "save" | "share"; text: string }>;
  whatsapp_line?: string;
};

export type CarouselTheme = {
  colors?: Partial<Record<"sand" | "paper" | "night" | "terra" | "terra_light" | "muted", string>>;
  fonts?: { display?: string; body?: string; google_fonts_url?: string };
  photo_treatment?: PhotoTreatment;
};

export type CarouselSpec = {
  file_title: string;
  topic?: string;
  audience?: string;
  sources: string[];
  slides: CarouselSlide[];
  caption: string;
  brand?: { site?: string; phone?: string; phone_2?: string; badge?: string };
  theme?: CarouselTheme;
};

export type CarouselProblem = { slide: number | null; message: string; blocking: boolean };

const TREATMENT_VARS: Record<keyof PhotoTreatment, string> = {
  saturation: "--photo-sat",
  brightness: "--photo-bright",
  shade: "--shade",
};
const THEME_VARS: Record<string, string> = {
  sand: "--sand",
  paper: "--paper",
  night: "--night",
  terra: "--terra",
  terra_light: "--terraLt",
  muted: "--muted",
};
export const DEFAULT_TREATMENT: Required<PhotoTreatment> = { saturation: 0.55, brightness: 0.85, shade: 1 };
export const DEFAULT_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Urbanist:wght@500;600;700;800&display=block";
export const DEFAULT_BRAND = { site: "roogobf.com", phone: "(+226) 67 00 61 16", phone_2: "53 11 11 19" };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
// Pictographs and flags only: digits, # and * are not emoji here.
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const TEXT_FIELDS = ["title", "subtitle", "action", "action_label", "whatsapp_line", "label", "swipe"] as const;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function words(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** Every piece of text a slide shows, for the house checks. */
export function slideTexts(slide: CarouselSlide): string[] {
  const out: string[] = TEXT_FIELDS.map((k) => str(slide[k])).filter(Boolean);
  for (const step of slide.steps ?? []) out.push(str(step));
  for (const a of slide.actions ?? []) out.push(str(a?.text));
  return out;
}

/** Words counted against the 30-word target (the kicker label and swipe pill do not count). */
export function slideWordCount(slide: CarouselSlide): number {
  const counted = [slide.title, slide.subtitle, slide.action, slide.whatsapp_line, ...(slide.steps ?? [])];
  return counted.reduce((n, t) => n + words(str(t)), 0);
}

function cleanTreatment(value: unknown, where: string, problems: CarouselProblem[], slide: number | null): PhotoTreatment | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    problems.push({ slide, message: `${where} : réglage de photo invalide.`, blocking: true });
    return undefined;
  }
  const out: PhotoTreatment = {};
  for (const [k, v] of Object.entries(value)) {
    if (!(k in TREATMENT_VARS)) {
      problems.push({ slide, message: `${where} : réglage inconnu « ${k} ».`, blocking: true });
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 2) {
      problems.push({ slide, message: `${where} : « ${k} » doit être entre 0 et 2.`, blocking: true });
      continue;
    }
    out[k as keyof PhotoTreatment] = n;
  }
  return out;
}

/**
 * Reads a carrousel.json object. Returns the cleaned spec and every problem:
 * blocking ones stop a save, the others are shown as warnings (word count).
 */
export function parseCarouselSpec(input: unknown): { spec: CarouselSpec | null; problems: CarouselProblem[] } {
  const problems: CarouselProblem[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { spec: null, problems: [{ slide: null, message: "Le fichier carrousel.json est illisible.", blocking: true }] };
  }
  const raw = input as Record<string, unknown>;
  const fileTitle = str(raw.file_title).trim();
  if (!fileTitle) problems.push({ slide: null, message: "Il manque le titre du carrousel (file_title).", blocking: true });

  const rawSlides = Array.isArray(raw.slides) ? raw.slides : [];
  if (rawSlides.length < MIN_SLIDES || rawSlides.length > MAX_SLIDES) {
    problems.push({ slide: null, message: `Un carrousel compte de ${MIN_SLIDES} à ${MAX_SLIDES} slides.`, blocking: true });
  } else if (rawSlides.length > MAX_PUBLISHED_SLIDES) {
    problems.push({ slide: null, message: `Instagram publie 10 slides au maximum depuis Roogo.`, blocking: false });
  }

  const slides: CarouselSlide[] = rawSlides.map((value, index) => {
    const n = index + 1;
    const s = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const type = str(s.type) as SlideType;
    if (!(SLIDE_TYPES as readonly string[]).includes(type)) {
      problems.push({ slide: n, message: `Slide ${n} : type inconnu « ${str(s.type)} ».`, blocking: true });
    }
    const slide: CarouselSlide = {
      type,
      label: str(s.label) || undefined,
      photo: str(s.photo),
      photo_position: str(s.photo_position) || undefined,
      photo_treatment: cleanTreatment(s.photo_treatment, `Slide ${n}`, problems, n),
      photo_source: s.photo_source === "real" || s.photo_source === "generated" ? s.photo_source : undefined,
      title: str(s.title),
      subtitle: str(s.subtitle) || undefined,
      swipe: str(s.swipe) || undefined,
      number: typeof s.number === "number" || typeof s.number === "string" ? s.number : undefined,
      action: str(s.action) || undefined,
      action_label: str(s.action_label) || undefined,
      steps: Array.isArray(s.steps) ? s.steps.map(str).filter(Boolean) : undefined,
      actions: Array.isArray(s.actions)
        ? s.actions
            .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>) : {}))
            .map((a) => ({ icon: a.icon === "share" ? ("share" as const) : ("save" as const), text: str(a.text) }))
            .filter((a) => a.text)
        : undefined,
      whatsapp_line: str(s.whatsapp_line) || undefined,
    };
    if (!slide.photo) problems.push({ slide: n, message: `Slide ${n} : il manque la photo.`, blocking: true });
    if (!slide.title.trim()) problems.push({ slide: n, message: `Slide ${n} : il manque le titre.`, blocking: true });
    if (type === "point" && slide.number === undefined) problems.push({ slide: n, message: `Slide ${n} : il manque le numéro.`, blocking: true });
    if (type === "roogo" && !(slide.steps && slide.steps.length)) problems.push({ slide: n, message: `Slide ${n} : il manque les étapes Roogo.`, blocking: true });
    if (slide.photo_position && !/^[\d.]+% [\d.]+%$/.test(slide.photo_position)) {
      problems.push({ slide: n, message: `Slide ${n} : cadrage invalide (ex. « 50% 70% »).`, blocking: true });
    }
    const texts = slideTexts(slide);
    if (texts.some((t) => /[—–]/.test(t))) problems.push({ slide: n, message: `Slide ${n} : pas de tiret cadratin, utilisez une virgule.`, blocking: true });
    if (texts.some((t) => EMOJI_RE.test(t))) problems.push({ slide: n, message: `Slide ${n} : pas d'emoji sur les slides.`, blocking: true });
    const count = slideWordCount(slide);
    if (count > WORD_TARGET + 5) problems.push({ slide: n, message: `Slide ${n} : ${count} mots (30 au maximum conseillés).`, blocking: false });
    return slide;
  });

  if (slides.length && slides[0].type !== "cover") problems.push({ slide: 1, message: "La première slide doit être la couverture.", blocking: false });
  if (slides.length && slides[slides.length - 1].type !== "cta") problems.push({ slide: slides.length, message: "La dernière slide doit être l'appel à l'action.", blocking: false });

  const caption = str(raw.caption).trim();
  if (!caption) problems.push({ slide: null, message: "Il manque la légende.", blocking: true });
  else if (!/roogobf\.com/i.test(caption)) problems.push({ slide: null, message: "La légende doit contenir roogobf.com.", blocking: false });

  const sources = Array.isArray(raw.sources) ? raw.sources.map(str).filter(Boolean) : [];
  if (!sources.length) problems.push({ slide: null, message: "Ajoutez les sources des affirmations (sources).", blocking: false });

  const theme = (raw.theme && typeof raw.theme === "object" ? raw.theme : undefined) as CarouselTheme | undefined;
  if (theme?.colors) {
    for (const [k, v] of Object.entries(theme.colors)) {
      if (!(k in THEME_VARS) || !HEX_RE.test(str(v))) problems.push({ slide: null, message: `Couleur invalide : ${k}.`, blocking: true });
    }
  }
  const themeTreatment = theme ? cleanTreatment(theme.photo_treatment, "Thème", problems, null) : undefined;
  const brand = (raw.brand && typeof raw.brand === "object" ? raw.brand : undefined) as CarouselSpec["brand"];

  const spec: CarouselSpec = {
    file_title: fileTitle,
    topic: str(raw.topic) || undefined,
    audience: str(raw.audience) || undefined,
    sources,
    slides,
    caption,
    brand: brand
      ? { site: str(brand.site) || undefined, phone: str(brand.phone) || undefined, phone_2: str(brand.phone_2) || undefined, badge: str(brand.badge) || undefined }
      : undefined,
    theme: theme ? { colors: theme.colors, fonts: theme.fonts, photo_treatment: themeTreatment } : undefined,
  };
  return { spec, problems };
}

export function blockingProblems(problems: CarouselProblem[]): CarouselProblem[] {
  return problems.filter((p) => p.blocking);
}

// ---------------------------------------------------------------------------
// HTML: a faithful port of build_carrousel.py, so the Studio and the skill
// draw the same slides from the same file.
// ---------------------------------------------------------------------------

function escapeHtml(text: string, quote = false): string {
  const out = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return quote ? out.replace(/"/g, "&quot;").replace(/'/g, "&#x27;") : out;
}

/** Escapes text and turns *words* into the italic accent. */
export function rich(text: string): string {
  return escapeHtml(text).replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function treatmentStyle(t: PhotoTreatment | undefined): string {
  if (!t || !Object.keys(t).length) return "";
  return ` style="${(Object.keys(t) as Array<keyof PhotoTreatment>).map((k) => `${TREATMENT_VARS[k]}:${Number(t[k])}`).join(";")}"`;
}

function hexRgb(value: string): string {
  const v = value.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)).join(",");
}

function themeCss(theme: CarouselTheme | undefined): string {
  if (!theme) return "";
  const rules: string[] = [];
  const colors = theme.colors ?? {};
  for (const [k, v] of Object.entries(colors)) if (THEME_VARS[k] && v) rules.push(`${THEME_VARS[k]}:${v}`);
  if (colors.night) rules.push(`--deep:${hexRgb(colors.night)}`);
  if (colors.terra) rules.push(`--terra-rgb:${hexRgb(colors.terra)}`);
  if (theme.fonts?.display) rules.push(`--font-display:'${theme.fonts.display}',serif`);
  if (theme.fonts?.body) rules.push(`--font-body:'${theme.fonts.body}',sans-serif`);
  for (const [k, v] of Object.entries(theme.photo_treatment ?? {})) rules.push(`${TREATMENT_VARS[k as keyof PhotoTreatment]}:${Number(v)}`);
  return rules.length ? `:root{${rules.join(";")}}` : "";
}

function top(label: string, i: number, n: number): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `<div class="top"><span class="k">${rich(label)}</span><span class="n">${pad(i)} / ${pad(n)}</span></div>`;
}

const ICONS = {
  save: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  share: '<path d="M21 3 3 10.5l7 3 3 7.5z"/><path d="m10 13.5 4.5-4.5"/>',
};

export type RenderOptions = {
  /** Resolves a slide's `photo` (a storage path, a relative path or a URL) to a URL the browser can load. */
  photoUrl: (ref: string) => string;
  badgeUrl: string;
};

function slideHtml(s: CarouselSlide, i: number, n: number, brand: typeof DEFAULT_BRAND, opts: RenderOptions): string {
  const photo = escapeHtml(opts.photoUrl(s.photo), true);
  const pos = escapeHtml(s.photo_position ?? "50% 50%", true);
  const bg = `<img class="bg" src="${photo}" style="object-position:${pos}" crossorigin="anonymous">`;
  const badge = `<img class="badge" src="${escapeHtml(opts.badgeUrl, true)}" crossorigin="anonymous">`;
  const treat = treatmentStyle(s.photo_treatment);
  const foot = `<div class="foot"><span>${escapeHtml(brand.site)}</span><span class="arrow">→</span></div>`;
  const label = s.label ?? "";

  if (s.type === "cover") {
    return (
      `<section class="s cover"${treat}>${bg}<div class="in">${top(label, i, n)}` +
      `<h1>${rich(s.title)}</h1><p class="sub">${rich(s.subtitle ?? "")}</p></div>` +
      `${badge}<div class="pill">${escapeHtml(s.swipe ?? "Glissez")} →</div></section>`
    );
  }
  if (s.type === "point") {
    const action = s.action ? `<div class="action"><b>${rich(s.action_label ?? "À faire")}</b><p>${rich(s.action)}</p></div>` : "";
    return (
      `<section class="s"${treat}>${bg}<div class="shade"></div><div class="in">` +
      `${top(label, i, n)}<div class="num">${escapeHtml(String(s.number ?? ""))}</div>` +
      `<h1>${rich(s.title)}</h1></div>${action}${foot}</section>`
    );
  }
  if (s.type === "roogo") {
    const steps = (s.steps ?? []).map((t, k) => `<div><i>${k + 1}</i>${rich(t)}</div>`).join("");
    return (
      `<section class="s terra"${treat}>${bg}<div class="shade"></div><div class="in">` +
      `${top(s.label ?? "Sur Roogo", i, n)}<h1>${rich(s.title)}</h1>` +
      `<div class="steps">${steps}</div></div>${badge}</section>`
    );
  }
  const rows = (s.actions ?? [])
    .map(
      (a) =>
        `<div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
        `stroke-linejoin="round">${ICONS[a.icon === "share" ? "share" : "save"]}</svg>${rich(a.text)}</div>`,
    )
    .join("");
  const contact =
    `<div class="contact"><div><div class="wa">${rich(s.whatsapp_line ?? "")}</div>` +
    `<div class="w">${escapeHtml(brand.phone)}</div>` +
    `<div class="t">${escapeHtml(brand.site)} · ${escapeHtml(brand.phone_2)}</div></div>` +
    `${badge}</div>`;
  return (
    `<section class="s cta"${treat}>${bg}<div class="shade"></div><div class="in">` +
    `${top(label, i, n)}<h1>${rich(s.title)}</h1><div class="icons">${rows}</div></div>` +
    `${contact}</section>`
  );
}

/**
 * One self-contained HTML page showing slide `index` (1-based) at 1080x1350.
 * The Studio puts it in a sandboxed iframe, so the carousel's styles never
 * touch the admin's and the result matches the skill's render.
 */
export function carouselSlidePage(spec: CarouselSpec, index: number, opts: RenderOptions): string {
  const brand = {
    site: spec.brand?.site || DEFAULT_BRAND.site,
    phone: spec.brand?.phone || DEFAULT_BRAND.phone,
    phone_2: spec.brand?.phone_2 || DEFAULT_BRAND.phone_2,
  };
  const n = spec.slides.length;
  const slide = spec.slides[index - 1];
  const fonts = spec.theme?.fonts?.google_fonts_url || DEFAULT_FONTS_URL;
  const badgeUrl = spec.brand?.badge ? opts.photoUrl(spec.brand.badge) : opts.badgeUrl;
  const body = slide ? slideHtml(slide, index, n, brand, { ...opts, badgeUrl }).replace('class="s', 'class="s on') : "";
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<link href="${escapeHtml(fonts, true)}" rel="stylesheet" crossorigin="anonymous">` +
    `<style>${CAROUSEL_CSS}${themeCss(spec.theme)}</style></head><body>${body}</body></html>`
  );
}

/** Output file name of one slide: the French title, like the skill's. */
export function slideFileName(spec: Pick<CarouselSpec, "file_title">, index: number): string {
  const safe = spec.file_title.replace(/[\\/:*?"<>|]/g, "").trim() || "Roogo - carrousel";
  return `${safe} - ${String(index).padStart(2, "0")}.jpg`;
}

/** Storage layout of a carousel in the content-studio bucket. */
export const carouselPaths = {
  photo: (artifactId: string, name: string) => `carousels/${artifactId}/photos/${name}`,
  slide: (artifactId: string, version: string, index: number) =>
    `carousels/${artifactId}/slides/${version}/${String(index).padStart(2, "0")}.jpg`,
  isOwnPhoto: (artifactId: string, path: string) => path.startsWith(`carousels/${artifactId}/photos/`) && !path.includes(".."),
  isOwnSlide: (artifactId: string, version: string, path: string) =>
    path.startsWith(`carousels/${artifactId}/slides/${version}/`) && !path.includes(".."),
};

/** Photo names in a carousel folder: lower-case, no spaces, one extension. */
export function safePhotoName(original: string, index: number): string {
  const ext = /\.(png|webp)$/i.test(original) ? original.slice(original.lastIndexOf(".")).toLowerCase() : ".jpg";
  const base = original
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `${String(index).padStart(2, "0")}-${base || "photo"}${ext}`;
}

/** What the Studio stores in studio_artifacts.meta for a carousel. */
export type CarouselMeta = {
  spec: CarouselSpec;
  /** Ordered slide JPEGs of the current render (empty until the first render is saved). */
  slides: string[];
  /** Version folder of `slides`, so a new render never overwrites the published one. */
  version: string | null;
  rendered_at: string | null;
  /** A render was asked for but not confirmed yet. */
  pending_version?: string | null;
};

export function readCarouselMeta(meta: unknown): CarouselMeta | null {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const { spec } = parseCarouselSpec(m.spec);
  if (!spec) return null;
  return {
    spec,
    slides: Array.isArray(m.slides) ? m.slides.map(str).filter(Boolean) : [],
    version: str(m.version) || null,
    rendered_at: str(m.rendered_at) || null,
    pending_version: str(m.pending_version) || null,
  };
}

/** Every photo a carousel uses (slides and logo), for signing and checks. */
export function carouselPhotoRefs(spec: CarouselSpec): string[] {
  const refs = spec.slides.map((s) => s.photo).filter(Boolean);
  if (spec.brand?.badge) refs.push(spec.brand.badge);
  return [...new Set(refs)];
}

// The carousel design, verbatim from the social-carousels skill
// (roogo-skills: skills/social-carousels/assets/carrousel.css). Keep the two
// identical: the skill renders the same carrousel.json with headless Chrome,
// the Studio renders it in the browser, and both must give the same slides.
// Change the design in the skill first, then paste it here.

export const CAROUSEL_CSS = ":root{--sand:#F4E8D7;--paper:#FBF3E8;--night:#2B241D;--deep:26,21,17;--terra:#C96A2E;--terraLt:#F08F52;--muted:#e6d8c5;--terra-rgb:201,106,46;\n--font-display:Fraunces,serif;--font-body:Urbanist,sans-serif;\n--photo-sat:.55;--photo-bright:.85;--shade:1}\n*{box-sizing:border-box;margin:0;padding:0}\nhtml,body{width:1080px;height:1350px;overflow:hidden;background:var(--night)}\n.s{display:none;position:relative;width:1080px;height:1350px;overflow:hidden;font-family:var(--font-body);color:var(--paper)}\n.s.on{display:block}\n.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(var(--photo-sat)) brightness(var(--photo-bright))}\n.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(var(--deep),calc(var(--shade)*.86)) 0%,rgba(var(--deep),calc(var(--shade)*.62)) 34%,rgba(var(--deep),calc(var(--shade)*.42)) 50%,rgba(var(--deep),calc(var(--shade)*.82)) 70%,rgba(var(--deep),calc(var(--shade)*.94)) 100%)}\n.in{position:absolute;inset:0;padding:84px 88px}\n.top{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:24px;letter-spacing:.16em;text-transform:uppercase;text-shadow:0 2px 10px rgba(0,0,0,.5);margin-bottom:25px}\n.top .k{color:var(--terraLt)}\n.top .n{opacity:.75}\n.num{font-family:var(--font-display);font-weight:400;font-size:340px;line-height:.8;color:var(--terraLt);margin-top:70px;letter-spacing:-.04em;text-shadow:0 6px 40px rgba(0,0,0,.55)}\nh1{font-family:var(--font-display);font-weight:600;font-size:96px;line-height:1.03;letter-spacing:-.02em;margin-top:26px;color:var(--paper);text-shadow:0 3px 8px rgba(0,0,0,.35),0 8px 40px rgba(0,0,0,.55)}\nh1 em{font-style:italic;font-weight:500;color:var(--terraLt)}\n.action{position:absolute;left:88px;right:88px;bottom:150px;padding-top:30px}\n.action b{display:block;font-size:24px;letter-spacing:.16em;text-transform:uppercase;color:var(--terraLt);margin-bottom:14px}\n.action p{font-size:46px;line-height:1.28;font-weight:700;color:var(--paper);text-shadow:0 2px 18px rgba(0,0,0,.6)}\n.action p.soft{font-size:36px;font-weight:600;color:var(--muted);margin-top:14px}\n.foot{position:absolute;left:88px;right:88px;bottom:70px;display:flex;justify-content:space-between;align-items:center;font-size:24px;font-weight:700;letter-spacing:.06em;color:var(--paper);opacity:.8}\n.arrow{font-size:40px}\n.badge{width:96px;height:96px;border-radius:50%;box-shadow:0 6px 24px rgba(0,0,0,.3)}\n/* cover (light top) */\n.cover{--photo-sat:1;--photo-bright:1}\n.cover .in{background:linear-gradient(180deg,rgba(244,232,215,.96) 0%,rgba(244,232,215,.9) 38%,rgba(244,232,215,0) 58%)}\n.cover .top,.cover h1{text-shadow:none}\n.cover .top .k{color:var(--terra)}.cover .top .n{color:var(--night);opacity:.55}\n.cover h1{font-size:118px;line-height:.98;margin-top:56px;max-width:900px;color:var(--night)}\n.cover h1 em{color:var(--terra)}\n.cover .sub{font-size:42px;font-weight:600;margin-top:30px;color:var(--night)}\n.cover .badge{position:absolute;left:88px;bottom:84px}\n.pill{position:absolute;right:88px;bottom:84px;background:var(--terra);color:#fff;font-weight:800;font-size:30px;letter-spacing:.06em;padding:22px 34px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.3)}\n/* roogo */\n.terra .shade{background:linear-gradient(180deg,rgba(var(--terra-rgb),calc(var(--shade)*.9)) 0%,rgba(185,92,36,calc(var(--shade)*.68)) 55%,rgba(110,50,18,calc(var(--shade)*.9)) 100%)}\n.terra .top .k{color:#fff}\n.terra h1{font-size:140px;margin-top:180px}\n.terra h1 em{color:var(--night);text-shadow:none}\n.steps{margin-top:80px;display:flex;flex-direction:column;gap:30px}\n.steps div{display:flex;align-items:center;gap:26px;font-size:46px;font-weight:700;text-shadow:0 2px 14px rgba(0,0,0,.3)}\n.steps i{font-style:normal;width:66px;height:66px;border-radius:50%;background:#fff;color:var(--terra);display:grid;place-items:center;font-size:32px;font-weight:800;flex:none;text-shadow:none}\n.terra .badge{position:absolute;right:88px;bottom:84px;width:132px;height:132px}\n/* cta */\n.cta h1{font-size:128px;margin-top:170px}\n.icons{display:flex;flex-direction:column;gap:36px;margin-top:90px}\n.ic{display:flex;align-items:center;gap:26px;font-size:46px;font-weight:700;text-shadow:0 2px 14px rgba(0,0,0,.5)}\n.ic svg{width:80px;height:80px;flex:none;color:var(--terraLt)}\n.contact{position:absolute;left:88px;right:88px;bottom:84px;display:flex;justify-content:space-between;align-items:center;padding-top:36px}\n.contact .wa{font-size:30px;font-weight:700;color:var(--terraLt);margin-bottom:10px}\n.contact .w{font-size:52px;font-weight:800}\n.contact .t{font-size:30px;font-weight:700;color:var(--muted);margin-top:8px}\n";
