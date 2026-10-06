// Prompts for the poster tools. Built from the 2026-10-03 poster bake-off and
// verified on 2026-10-06 with real calls: flat brand-color field, the real
// photo kept as is, the real logo attached as an image (never described),
// single-line text, no generated people.

export type PosterRatio = "4:5" | "9:16" | "1:1";

export const BRAND = {
  terracotta: "#C96A2E",
  sand: "#F4E8D7",
  night: "#2B241D",
} as const;

export const CONTACT_PHONE = "+226 67 00 61 16";
export const LOGO_URL = "https://www.roogobf.com/logo.png";

const MAX_LINE = 60;

/** A line of poster text: single line, no quotes or dashes that break rendering. */
export function cleanPosterLine(value: string): string {
  return value
    .replace(/[—–]/g, ",")
    .replace(/[«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINE);
}

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

export type GreetingLines = { headline: string; subline: string };

const SCENES: Record<string, string> = {
  sunrise: "painted Sahelian sunrise with acacia tree silhouettes and warm light",
  sunset: "painted Sahelian sunset with acacia tree silhouettes and warm light",
  rain: "painted Sahelian landscape after the first rain, fresh green fields and a soft sky",
  calm: "calm sand-colored paper texture with a simple painted horizon line",
};

export function sceneKeys(): string[] {
  return Object.keys(SCENES);
}

export function buildGreetingPrompt(
  lines: GreetingLines,
  ratio: PosterRatio,
  scene = "sunrise",
): string {
  const painted = SCENES[scene] ?? SCENES.sunrise;
  return [
    `Greeting poster, ${ratio}, flat terracotta (${BRAND.terracotta}) background.`,
    `A ${painted} at the top.`,
    `One big headline in white: "${cleanPosterLine(lines.headline)}".`,
    `Under it, a smaller line in dark brown (${BRAND.night}): "${cleanPosterLine(lines.subline)}".`,
    "Clean and modern. No people, no religious figures, no other text, no watermark. Write every character exactly as given, with correct French accents.",
  ].join(" ");
}
