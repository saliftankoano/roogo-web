// Prompts for the poster tools. Built from the 2026-10-03 poster bake-off and
// verified on 2026-10-06 with real calls: flat brand-color field, the real
// photo kept as is, the real logo attached as an image (never described),
// no generated people.
//
// 2026-10-23: the free poster ("Affiche libre", formerly "Affiche de voeux")
// always came out as the same painted Sahelian sunrise on terracotta. It now
// draws from a library of art-direction families chosen from the subject of
// the text, never the same family twice in a row, with randomised layout,
// illustration scale and palette. Pure module (no imports) so the browser
// form and the node tests share it.

export type PosterRatio = "4:5" | "9:16" | "1:1";

export const BRAND = {
  terracotta: "#C96A2E",
  sand: "#F4E8D7",
  night: "#2B241D",
  cream: "#F6F1EA",
} as const;

export type BrandColor = keyof typeof BRAND;

const COLOR_NAMES: Record<BrandColor, string> = {
  terracotta: "terracotta",
  sand: "warm sand",
  night: "deep night brown",
  cream: "cream",
};

export const CONTACT_PHONE = "+226 67 00 61 16";
export const LOGO_URL = "https://www.roogobf.com/logo.png";

const MAX_LINE = 60;
export const HEADLINE_MAX = 90;
export const SUBLINE_MAX = 70;

/* ---------- text ---------- */

// Emoji, flags, keycaps, skin tones and the invisible joiners around them.
const PICTOGRAPHS =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

export function hasPictographs(value: string): boolean {
  return new RegExp(PICTOGRAPHS.source, "u").test(value);
}

/** Removes emoji and other pictographs; they are never written on an image. */
export function stripPictographs(value: string): string {
  return value.replace(PICTOGRAPHS, " ").replace(/\s+/g, " ").trim();
}

/** Single line, no quotes or dashes that break rendering, no emoji. Never cut. */
export function cleanPosterText(value: string): string {
  return stripPictographs(
    value
      .replace(/[—–]/g, ",")
      .replace(/[«»"“”]/g, "")
      .replace(/\s+/g, " "),
  )
    .replace(/^[\s,;:]+|[\s,;:]+$/g, "")
    .trim();
}

// Words a cut line must not end on ("... à", "... de").
const DANGLING = new Set([
  "à", "a", "au", "aux", "de", "du", "des", "d'", "l'", "le", "la", "les", "et", "en",
  "pour", "sur", "avec", "un", "une", "ou", "par", "dans", "chez", "vers", "très",
]);

/** Cuts at a word boundary only (a single word longer than max is the one exception). */
export function cutAtWord(value: string, max: number): { text: string; shortened: boolean } {
  if (value.length <= max) return { text: value, shortened: false };
  const room = value.slice(0, max + 1);
  const space = room.lastIndexOf(" ");
  let text = space > 0 ? room.slice(0, space) : value.slice(0, max);
  for (;;) {
    text = text.replace(/[\s,;:.!?]+$/g, "");
    const words = text.split(" ");
    const last = words[words.length - 1]?.toLowerCase() ?? "";
    if (words.length > 1 && (DANGLING.has(last) || /^[dl]'$/.test(last))) {
      text = words.slice(0, -1).join(" ");
      continue;
    }
    break;
  }
  return { text, shortened: true };
}

/** A line of poster text, cleaned and cut at a word boundary when too long. */
export function cleanPosterLine(value: string, max = MAX_LINE): string {
  return cutAtWord(cleanPosterText(value), max).text;
}

/** Splits a headline in at most 2 balanced lines at a word boundary. */
export function wrapHeadline(text: string, oneLineMax = 28): string[] {
  if (text.length <= oneLineMax || !text.includes(" ")) return [text];
  const middle = text.length / 2;
  // Closest space to the middle; a line never ends on "à", "de", "la"...
  const cost = (i: number) => {
    const before = text.slice(0, i).split(" ").pop()?.toLowerCase() ?? "";
    return Math.abs(i - middle) + (DANGLING.has(before) ? 1000 : 0);
  };
  let best = -1;
  for (let i = text.indexOf(" "); i !== -1; i = text.indexOf(" ", i + 1)) {
    if (best === -1 || cost(i) < cost(best)) best = i;
  }
  return [text.slice(0, best), text.slice(best + 1)];
}

export type FittedLine = {
  /** What the person typed, untouched. */
  typed: string;
  /** What is sent to the image model. */
  text: string;
  shortened: boolean;
  hadPictographs: boolean;
};

export type FittedGreeting = {
  headline: FittedLine & { lines: string[] };
  subline: FittedLine;
  /** French notices shown before generating. */
  notices: string[];
};

function fitLine(typed: string, max: number): FittedLine {
  const cut = cutAtWord(cleanPosterText(typed), max);
  return { typed, text: cut.text, shortened: cut.shortened, hadPictographs: hasPictographs(typed) };
}

export function fitGreetingText(input: { headline: string; subline?: string }): FittedGreeting {
  const head = fitLine(input.headline ?? "", HEADLINE_MAX);
  const sub = fitLine(input.subline ?? "", SUBLINE_MAX);
  const notices: string[] = [];
  if (head.shortened) {
    notices.push(
      `Message principal trop long (${HEADLINE_MAX} caractères au maximum) : l'image affichera « ${head.text} ».`,
    );
  }
  if (sub.shortened) {
    notices.push(
      `Deuxième ligne trop longue (${SUBLINE_MAX} caractères au maximum) : l'image affichera « ${sub.text} ».`,
    );
  }
  if (head.hadPictographs || sub.hadPictographs) {
    notices.push("Les emoji et pictogrammes ne sont pas écrits sur l'image.");
  }
  return { headline: { ...head, lines: wrapHeadline(head.text) }, subline: sub, notices };
}

/* ---------- property poster ---------- */

export type PosterLines = {
  headline: string;
  place: string;
  price: string;
  phone: string;
};

export function buildPosterPrompt(lines: PosterLines, ratio: PosterRatio): string {
  const l = {
    headline: cleanPosterLine(lines.headline),
    place: cleanPosterLine(lines.place),
    price: cleanPosterLine(lines.price),
    phone: cleanPosterLine(lines.phone),
  };
  return [
    `Poster for a property listing, ${ratio}.`,
    "Keep the property exactly as it appears in the first photo: same building, same colors, nothing added, nothing removed.",
    `Flat terracotta (${BRAND.terracotta}) background field with the photo placed inside a rounded frame.`,
    "Use the second image as the Roogo logo, top-left, unchanged.",
    `One big single-line headline in white: "${l.headline}".`,
    `Under it, a smaller line in dark brown (${BRAND.night}): "${l.place}".`,
    `A dark brown rounded price band with white text: "${l.price}".`,
    `Bottom line in dark brown: "${l.phone}".`,
    "No people, no animals, no other text, no watermark. Write every character exactly as given, with correct French accents.",
  ].join(" ");
}

/* ---------- subject ---------- */

export type Subject = "land" | "house" | "celebration" | "hiring" | "general";

export const SUBJECT_LABELS: Record<Subject, string> = {
  land: "Terrain",
  house: "Maison",
  celebration: "Fête, voeux",
  hiring: "Recrutement",
  general: "Message général",
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’`]/g, "'");
}

const SUBJECT_PATTERNS: Array<[Subject, RegExp]> = [
  [
    "hiring",
    /\b(recrut\w*|on recrute|offres? d'emploi|emplois?|postes? a pourvoir|candidat\w*|stagiaires?|embauch\w*|rejoignez (?:l'equipe|notre equipe|nous))\b/,
  ],
  [
    "land",
    /(\b(terrains?|parcelles?|lotissements?|loti(?:e|es|s)?|non loti|hectares?|superficie|bornage|bornes?|titre foncier|m2)\b|m²)/,
  ],
  [
    "house",
    /\b(maisons?|villas?|appartements?|apparts?|duplex|logements?|chambres? salon|immeubles?|r\+\d|cour unique|bungalows?|residences?|a louer)\b/,
  ],
  [
    "celebration",
    /\b(fetes?|tabaski|ramadan|aid|eid|noel|nouvel an|bonne annee|bonne semaine|bon mois|bon week-?end|bonne rentree|independance|paques|maouloud|joyeux|joyeuse|voeux|felicitations|anniversaire|8 mars)\b/,
  ],
];

/** The subject of a poster, from its text. The headline wins over the second line. */
export function inferSubject(...texts: string[]): Subject {
  for (const text of texts) {
    const folded = fold(text ?? "");
    for (const [subject, pattern] of SUBJECT_PATTERNS) {
      if (pattern.test(folded)) return subject;
    }
  }
  return "general";
}

/* ---------- art direction ---------- */

export type Layout = "top" | "bottom" | "left" | "center";
export type Scale = "accent" | "half" | "full";

export type StyleFamily = {
  id: string;
  /** Short French name shown in the Studio. */
  label: string;
  subjects: Subject[];
  backgrounds: BrandColor[];
  layouts: Layout[];
  scales: Scale[];
  /** Concrete visual description sent to the model. */
  visual: string;
};

const ALL: Subject[] = ["land", "house", "celebration", "hiring", "general"];

export const STYLE_FAMILIES: StyleFamily[] = [
  {
    id: "typo",
    label: "Typo",
    subjects: ALL,
    backgrounds: ["sand", "cream", "terracotta", "night"],
    layouts: ["top", "center", "left"],
    scales: ["accent"],
    visual:
      "bold typographic poster: the words are the hero, set very large, with one big simple geometric shape (a circle, an arch or a half sun) in the accent colour behind part of the words, nothing else",
  },
  {
    id: "nuit",
    label: "Nuit",
    subjects: ["general", "celebration", "house", "hiring"],
    backgrounds: ["night"],
    layouts: ["top", "bottom", "center", "left"],
    scales: ["accent", "half"],
    visual:
      "night scene on a deep night-brown background with warm light accents: a few softly glowing lit windows on low rooftops and a thin warm glow along the horizon",
  },
  {
    id: "ouaga",
    label: "Ouaga",
    subjects: ["general", "house", "celebration"],
    backgrounds: ["sand", "cream", "terracotta"],
    layouts: ["top", "bottom", "left"],
    scales: ["half", "full"],
    visual:
      "flat vector illustration of a Ouagadougou street and rooftops: low houses with flat roofs, a water tower, neem trees, a few parked motorbikes, warm afternoon light, the street empty",
  },
  {
    id: "parcelle",
    label: "Parcelle",
    subjects: ["land"],
    backgrounds: ["sand", "cream", "terracotta"],
    layouts: ["top", "bottom", "center"],
    scales: ["half", "full"],
    visual:
      "aerial top-down illustration of a plot of land: red laterite soil, four concrete boundary markers with red tops at the corners joined by a thin dotted line, a dirt road along one side, neighbouring plots lightly outlined, a few shrubs",
  },
  {
    id: "facade",
    label: "Façade",
    subjects: ["house"],
    backgrounds: ["sand", "cream", "night"],
    layouts: ["top", "bottom", "left"],
    scales: ["half", "full"],
    visual:
      "flat architectural illustration of a modern Burkina Faso house façade: a one-storey villa in warm render with clean lines, a low courtyard wall with a metal gate, a bougainvillea and a neem tree, crisp shadows",
  },
  {
    id: "dan-fani",
    label: "Dan Fani",
    subjects: ["celebration", "general"],
    backgrounds: ["cream", "sand", "night"],
    layouts: ["top", "bottom", "center"],
    scales: ["accent", "half"],
    visual:
      "festive geometric pattern inspired by Faso Dan Fani woven cloth: bands of narrow stripes and small diamond motifs in terracotta, night brown, sand and cream, used as a border or a woven band that never covers the words",
  },
  {
    id: "collage",
    label: "Papier découpé",
    subjects: ALL,
    backgrounds: ["sand", "cream", "terracotta"],
    layouts: ["top", "bottom", "center", "left"],
    scales: ["accent", "half"],
    visual:
      "minimal paper-cut collage: a few layered cut-paper shapes (a sun, gentle hills, simple rooftops) with soft paper shadows and a visible paper texture",
  },
  {
    id: "paysage",
    label: "Paysage",
    subjects: ["land", "general"],
    backgrounds: ["terracotta", "night", "sand"],
    layouts: ["top", "bottom"],
    scales: ["full"],
    visual:
      "photo-style golden-hour landscape of the Burkina Faso countryside: open savanna, a laterite track, scattered shea and baobab trees, soft natural light, realistic photography look",
  },
  {
    id: "blocs",
    label: "Deux blocs",
    subjects: ALL,
    backgrounds: ["terracotta", "night", "sand"],
    layouts: ["top", "bottom", "left"],
    scales: ["half"],
    visual:
      "split layout: the canvas divided by one straight edge into two flat colour blocks (the main colour and the accent colour), a simple single-line drawing (a house outline, a key or a plot outline) in one block and the words in the other",
  },
  {
    id: "bureau",
    label: "Bureau",
    subjects: ["hiring"],
    backgrounds: ["sand", "cream", "night"],
    layouts: ["top", "bottom", "left"],
    scales: ["accent", "half"],
    visual:
      "flat illustration of a bright, empty workspace: a desk with an open laptop, a phone, a set of keys and a notebook, a chair and a potted plant, nobody in the room",
  },
  {
    id: "cles",
    label: "Clés",
    subjects: ["house", "general"],
    backgrounds: ["cream", "sand", "night"],
    layouts: ["top", "bottom", "center"],
    scales: ["accent", "half"],
    visual:
      "still-life illustration seen from above: a set of house keys on a ring with a plain terracotta tag, a soft natural shadow, lots of calm space",
  },
];

export function isStyleFamily(value: unknown): value is string {
  return typeof value === "string" && STYLE_FAMILIES.some((f) => f.id === value);
}

export function familyById(id: string): StyleFamily | undefined {
  return STYLE_FAMILIES.find((f) => f.id === id);
}

export function familiesFor(subject: Subject): StyleFamily[] {
  return STYLE_FAMILIES.filter((f) => f.subjects.includes(subject));
}

export type Design = {
  family: string;
  background: BrandColor;
  accent: BrandColor;
  layout: Layout;
  scale: Scale;
};

export type PastDesign = { family: string; background?: string | null };

function pick<T>(items: readonly T[], random: () => number): T {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[Math.max(0, index)];
}

/**
 * Picks the art direction. `recent` is newest first. A family the person chose
 * is honoured as is; otherwise ("surprise") the pick is among the families
 * that fit the subject, never the latest one and, when the pool allows, none
 * of the last three, and never one listed in `avoid`.
 */
export function chooseDesign(input: {
  subject: Subject;
  ratio: PosterRatio;
  recent?: PastDesign[];
  avoid?: string[];
  requested?: string | null;
  random?: () => number;
}): Design {
  const random = input.random ?? Math.random;
  const recent = (input.recent ?? []).filter((d) => isStyleFamily(d.family));
  const avoid = new Set((input.avoid ?? []).filter(isStyleFamily));
  const last = recent[0]?.family;

  let family: StyleFamily;
  const requested = input.requested ? familyById(input.requested) : undefined;
  if (requested) {
    family = requested;
  } else {
    const fit = familiesFor(input.subject);
    const recentIds = new Set(recent.slice(0, 3).map((d) => d.family));
    const tiers = [
      fit.filter((f) => !avoid.has(f.id) && !recentIds.has(f.id)),
      fit.filter((f) => !avoid.has(f.id) && f.id !== last),
      STYLE_FAMILIES.filter((f) => !avoid.has(f.id) && f.id !== last),
      STYLE_FAMILIES.filter((f) => f.id !== last),
    ];
    family = pick(tiers.find((t) => t.length > 0) ?? STYLE_FAMILIES, random);
  }

  // Palette swap: avoid the previous background when the family allows it.
  const lastBackground = recent[0]?.background;
  const backgrounds =
    family.backgrounds.length > 1
      ? family.backgrounds.filter((b) => b !== lastBackground)
      : family.backgrounds;
  const background = pick(backgrounds, random);
  const accents = (Object.keys(BRAND) as BrandColor[]).filter(
    (c) => c !== background && !(background === "sand" && c === "cream") && !(background === "cream" && c === "sand"),
  );
  const accent = pick(accents, random);
  const layouts = family.layouts.filter((l) => !(input.ratio === "9:16" && l === "left"));
  const layout = pick(layouts.length ? layouts : ["top" as Layout], random);
  const scale = pick(family.scales, random);
  return { family: family.id, background, accent, layout, scale };
}

const LAYOUT_TEXT: Record<Layout, string> = {
  top: "the words sit in the upper third, the illustration below them",
  bottom: "the illustration fills the upper part, the words sit in the lower third",
  left: "the words are left-aligned on the left half, the illustration on the right half",
  center: "the words are centred in the middle, the illustration frames them around the edges",
};

const SCALE_TEXT: Record<Scale, string> = {
  accent: "the illustration is small, about a quarter of the canvas, with generous empty space",
  half: "the illustration takes about half of the canvas",
  full: "the illustration fills the whole canvas edge to edge, with a calm, uncluttered area of the main colour behind the words so they stay readable",
};

function textColors(background: BrandColor): { headline: BrandColor; subline: BrandColor } {
  switch (background) {
    case "terracotta":
      return { headline: "cream", subline: "night" };
    case "night":
      return { headline: "cream", subline: "sand" };
    default:
      return { headline: "night", subline: "terracotta" };
  }
}

const color = (c: BrandColor) => `${COLOR_NAMES[c]} (${BRAND[c]})`;

export type GreetingLines = { headline: string; subline: string };

/** The free poster prompt. Text is cleaned, wrapped and stripped of emoji here too. */
export function buildGreetingPrompt(
  lines: GreetingLines,
  ratio: PosterRatio,
  design: Design,
): string {
  const fitted = fitGreetingText(lines);
  const family = familyById(design.family) ?? STYLE_FAMILIES[0];
  const colors = textColors(design.background);
  const headLines = fitted.headline.lines;
  const headline =
    headLines.length === 1
      ? `on one line: "${headLines[0]}"`
      : `on two lines, line 1: "${headLines[0]}", line 2: "${headLines[1]}"`;
  return [
    `Social media poster, ${ratio}.`,
    `Art direction: ${family.visual}.`,
    `Main colour ${color(design.background)}, accent colour ${color(design.accent)}; use only the Roogo palette: terracotta ${BRAND.terracotta}, sand ${BRAND.sand}, night brown ${BRAND.night}, cream ${BRAND.cream}, plus natural tones inside the illustration.`,
    `Composition: ${LAYOUT_TEXT[design.layout]}; ${SCALE_TEXT[design.scale]}.`,
    `Big bold modern sans-serif headline in ${color(colors.headline)}, ${headline}.`,
    fitted.subline.text
      ? `Under it, a smaller line in ${color(colors.subline)}: "${fitted.subline.text}".`
      : "",
    "Write only these words, exactly as given, with correct French accents. No other words, letters, numbers, signs or captions anywhere. No logo, no watermark.",
    "No people, no faces, no religious figures or symbols.",
    "The words sit directly on the background or the illustration: no rounded cards, no coloured edge bars, no frosted glass panels, no boxes or badges.",
  ]
    .filter(Boolean)
    .join(" ");
}
