// Shared definitions for the Studio's fal.ai tools. Pure, so it can be tested.
//
// Model allowlist: the Studio can only call the endpoints listed here. The
// banned list is the standing rule (2026-09-21, 2026-09-26): no video models
// and no lip-sync models from the web Studio.

export type JobTool = "poster" | "greeting" | "cutout" | "captions" | "music";

export const FAL_ENDPOINTS: Record<JobTool, string> = {
  poster: "openai/gpt-image-2/edit",
  greeting: "fal-ai/nano-banana-pro",
  cutout: "fal-ai/bria/background/remove",
  captions: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
  // Instrumental music for videos (2026-10-11): $0.08 per track of about 90 s.
  music: "fal-ai/lyria3/pro",
};

const BANNED_FRAGMENTS = [
  "seedance",
  "lipsync",
  "lip-sync",
  "kling",
  "veed/fabric",
  "text-to-video",
  "image-to-video",
];

export function isAllowedEndpoint(endpoint: string): boolean {
  const lower = endpoint.toLowerCase();
  if (BANNED_FRAGMENTS.some((fragment) => lower.includes(fragment))) return false;
  return (Object.values(FAL_ENDPOINTS) as string[]).includes(endpoint);
}

export function toolKind(tool: JobTool): "image" | "transcription" | "music" {
  return tool === "captions" ? "transcription" : tool === "music" ? "music" : "image";
}

/* ---------- formats ---------- */

export type PosterFormat = "4x5" | "9x16" | "1x1";

export const POSTER_FORMATS: Record<
  PosterFormat,
  { width: number; height: number; ratio: "4:5" | "9:16" | "1:1"; label: string }
> = {
  "4x5": { width: 1024, height: 1280, ratio: "4:5", label: "Publication (4:5)" },
  "9x16": { width: 1024, height: 1792, ratio: "9:16", label: "Story (9:16)" },
  "1x1": { width: 1024, height: 1024, ratio: "1:1", label: "Carré (1:1)" },
};

export function isPosterFormat(value: unknown): value is PosterFormat {
  return typeof value === "string" && value in POSTER_FORMATS;
}

/* ---------- pricing (USD) ---------- */

// Checked on 2026-10-06 against the fal model pages and real test calls.
// The edit price with input images is NOT published, so the poster estimate is
// deliberately high (shown as "environ"). Verify against the fal dashboard
// after the first real posters and lower it if it is much too high.
export const PRICE_CHECKED_ON = "2026-10-06";

const GPT_IMAGE_BASE_USD = { low: 0.005, medium: 0.042, high: 0.165 } as const;
const EDIT_INPUT_IMAGES_USD = 0.02;
const NANO_BANANA_PRO_USD = 0.15;
const BRIA_CUTOUT_USD = 0.018;
const SCRIBE_USD_PER_MINUTE = 0.008;
// Lyria 3 Pro, checked with a real call on 2026-10-11.
const LYRIA3_PRO_USD = 0.08;

export type PosterQuality = keyof typeof GPT_IMAGE_BASE_USD;

export function estimateJobCostUsd(input: {
  tool: JobTool;
  quality?: PosterQuality;
  format?: PosterFormat;
  audioSeconds?: number;
}): number {
  let usd: number;
  switch (input.tool) {
    case "poster": {
      const format = POSTER_FORMATS[input.format ?? "4x5"];
      // Price is quoted for 1024x1536; scale by pixels for other sizes.
      const pixelFactor = (format.width * format.height) / (1024 * 1536);
      usd =
        GPT_IMAGE_BASE_USD[input.quality ?? "medium"] * Math.max(pixelFactor, 0.6) +
        EDIT_INPUT_IMAGES_USD;
      break;
    }
    case "greeting":
      usd = NANO_BANANA_PRO_USD;
      break;
    case "cutout":
      usd = BRIA_CUTOUT_USD;
      break;
    case "music":
      usd = LYRIA3_PRO_USD;
      break;
    case "captions": {
      const minutes = Math.max(1, Math.ceil((input.audioSeconds ?? 60) / 60));
      usd = SCRIBE_USD_PER_MINUTE * minutes;
      break;
    }
  }
  // Round up to a tenth of a cent so the shown price is never lower than recorded.
  return Math.ceil(usd * 1000) / 1000;
}
