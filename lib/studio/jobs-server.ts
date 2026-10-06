import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  FAL_ENDPOINTS,
  POSTER_FORMATS,
  estimateJobCostUsd,
  isPosterFormat,
  type JobTool,
  type PosterFormat,
  type PosterQuality,
} from "./ai-tools";
import { alignScriptToWords, buildCues, toSrt } from "./captions";
import { normalizeScript } from "./copy-rules";
import {
  loadPropertyRow,
  propertyLabels,
  type ConversationRow,
} from "./conversations-server";
import { falResult } from "./fal-server";
import { comparePosterText, type ExpectedText, type PosterCheck } from "./poster-check";
import {
  CONTACT_PHONE,
  LOGO_URL,
  buildGreetingPrompt,
  buildPosterPrompt,
  cleanPosterLine,
  sceneKeys,
} from "./poster-prompt";
import { propertyTitle, toPropertySummary, type PropertyRow } from "./property-context";
import { STUDIO_BUCKET } from "./server";

const MAX_PHOTOS = 8;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type PreparedJob = {
  tool: JobTool;
  endpoint: string;
  input: Record<string, unknown>;
  estimateUsd: number;
  /** Stored on the ledger row so the poll route can finish the job. */
  context: Record<string, unknown>;
};

export type PrepareResult =
  | { ok: true; job: PreparedJob }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): PrepareResult => ({ ok: false, status, error });

function asString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function pickQuality(value: unknown): PosterQuality {
  return value === "low" || value === "high" ? value : "medium";
}

export function posterDefaults(row: PropertyRow) {
  const summary = toPropertySummary(row, propertyLabels);
  return {
    headline: propertyTitle(row, propertyLabels).split(",")[0],
    place: summary.place,
    price: summary.price,
    phone: CONTACT_PHONE,
    photos: (row.images ?? []).slice(0, MAX_PHOTOS),
  };
}

async function liveProperty(conversation: ConversationRow) {
  if (!conversation.property_id) return null;
  const row = await loadPropertyRow(conversation.property_id);
  return row && row.status === "en_ligne" ? row : null;
}

export async function prepareJob(
  tool: JobTool,
  params: Record<string, unknown>,
  conversation: ConversationRow,
): Promise<PrepareResult> {
  const endpoint = FAL_ENDPOINTS[tool];

  if (tool === "poster" || tool === "cutout") {
    const row = await liveProperty(conversation);
    if (!row) return fail(400, "Choisissez d'abord un bien en ligne.");
    const photos = (row.images ?? []).slice(0, MAX_PHOTOS);
    const index = Number.isInteger(params.photo_index) ? (params.photo_index as number) : 0;
    const photo = photos[index];
    if (!photo) return fail(400, "Ce bien n'a pas de photo.");

    if (tool === "cutout") {
      return {
        ok: true,
        job: {
          tool,
          endpoint,
          input: { image_url: photo },
          estimateUsd: estimateJobCostUsd({ tool }),
          context: { tool, property_id: row.id, photo },
        },
      };
    }

    const format: PosterFormat = isPosterFormat(params.format) ? params.format : "4x5";
    const quality = pickQuality(params.quality);
    const defaults = posterDefaults(row);
    const given = (params.lines ?? {}) as Record<string, unknown>;
    const lines = {
      headline: cleanPosterLine(normalizeScript(asString(given.headline, 60) || defaults.headline)),
      place: cleanPosterLine(normalizeScript(asString(given.place, 60) || defaults.place)),
      price: cleanPosterLine(normalizeScript(asString(given.price, 60) || defaults.price)),
      phone: CONTACT_PHONE,
    };
    if (!lines.headline || !lines.price) return fail(400, "Le titre et le prix sont obligatoires.");
    const size = POSTER_FORMATS[format];
    const expected: ExpectedText = {
      price: lines.price,
      phone: CONTACT_PHONE,
      place: lines.place,
    };
    return {
      ok: true,
      job: {
        tool,
        endpoint,
        input: {
          prompt: buildPosterPrompt(lines, size.ratio),
          image_urls: [photo, LOGO_URL],
          image_size: { width: size.width, height: size.height },
          quality,
          num_images: 1,
          output_format: "png",
        },
        estimateUsd: estimateJobCostUsd({ tool, quality, format }),
        context: { tool, property_id: row.id, photo, format, quality, lines, expected },
      },
    };
  }

  if (tool === "greeting") {
    const format: PosterFormat = isPosterFormat(params.format) ? params.format : "4x5";
    const headline = cleanPosterLine(normalizeScript(asString(params.headline, 60)));
    const subline = cleanPosterLine(normalizeScript(asString(params.subline, 60)));
    if (!headline) return fail(400, "Écrivez le message principal.");
    const scene = sceneKeys().includes(String(params.scene)) ? String(params.scene) : "sunrise";
    const size = POSTER_FORMATS[format];
    const expected: ExpectedText = { lines: [headline, ...(subline ? [subline] : [])] };
    return {
      ok: true,
      job: {
        tool,
        endpoint,
        input: {
          prompt: buildGreetingPrompt({ headline, subline }, size.ratio, scene),
          aspect_ratio: size.ratio,
          resolution: "1K",
          num_images: 1,
          output_format: "png",
        },
        estimateUsd: estimateJobCostUsd({ tool }),
        context: { tool, format, scene, lines: { headline, subline }, expected },
      },
    };
  }

  // captions: needs one of this conversation's voice-over artifacts.
  const artifactId = typeof params.artifact_id === "string" ? params.artifact_id : "";
  const { data: artifact } = await supabaseAdmin
    .from("studio_artifacts")
    .select("id, kind, text, output_path, conversation_id, meta")
    .eq("id", artifactId)
    .eq("conversation_id", conversation.id)
    .maybeSingle();
  if (!artifact || artifact.kind !== "voiceover" || !artifact.output_path) {
    return fail(400, "Choisissez une voix off de cette conversation.");
  }
  const { data: signed } = await supabaseAdmin.storage
    .from(STUDIO_BUCKET)
    .createSignedUrl(artifact.output_path, 3600);
  if (!signed?.signedUrl) return fail(500, "L'audio n'est pas accessible.");

  const meta = (artifact.meta ?? {}) as { duration_seconds?: number };
  const audioSeconds = meta.duration_seconds ?? 60;

  return {
    ok: true,
    job: {
      tool,
      endpoint,
      input: {
        audio_url: signed.signedUrl,
        language_code: "fra",
        diarize: false,
        tag_audio_events: false,
      },
      estimateUsd: estimateJobCostUsd({ tool, audioSeconds }),
      context: { tool, artifact_id: artifact.id },
    },
  };
}

/* ---------- finishing a completed job ---------- */

type GenerationRow = {
  id: string;
  user_id: string;
  input: Record<string, unknown> | null;
  conversation_id: string | null;
};

function imageUrlOf(tool: JobTool, data: Record<string, unknown>): string | null {
  if (tool === "cutout") {
    return (data.image as { url?: string } | undefined)?.url ?? null;
  }
  const images = data.images as Array<{ url?: string }> | undefined;
  return images?.[0]?.url ?? null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_IMAGE_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 0 && buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
  } catch {
    return null;
  }
}

/** Reads the visible text on a poster with a vision model, for the check. */
async function readPosterText(image: Buffer): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.STUDIO_VISION_MODEL || process.env.STUDIO_SCRIPT_MODEL;
  if (!apiKey || !model) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Tu lis le texte écrit sur une affiche. Réponds uniquement en JSON avec les clés: headline, place, price, phone, other (liste des autres textes visibles). Recopie les chiffres exactement tels qu'écrits.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Lis cette affiche." },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${image.toString("base64")}`, detail: "low" },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
    const strings: string[] = [];
    for (const value of Object.values(parsed)) {
      if (typeof value === "string") strings.push(value);
      if (Array.isArray(value)) for (const v of value) if (typeof v === "string") strings.push(v);
    }
    return strings.length ? strings : null;
  } catch {
    return null;
  }
}

export type FinishResult =
  | { ok: true; artifactId: string }
  | { ok: false; error: string };

export async function finishJob(
  gen: GenerationRow,
  responseUrl: string,
): Promise<FinishResult> {
  const context = (gen.input?.context ?? {}) as Record<string, unknown>;
  const tool = context.tool as JobTool;
  if (!gen.conversation_id || !(tool in FAL_ENDPOINTS)) {
    return { ok: false, error: "Tâche inconnue." };
  }

  const result = await falResult(responseUrl);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status === 422
          ? "L'image a été refusée par le filtre de sécurité. Changez le texte ou la photo."
          : "Le résultat n'a pas pu être récupéré. Réessayez.",
    };
  }

  /* ----- subtitles ----- */
  if (tool === "captions") {
    const words = (
      (result.data.words as Array<{ text: string; start: number; end: number; type?: string }>) ?? []
    ).filter((w) => w.type === "word" || w.type === undefined);
    const { data: voice } = await supabaseAdmin
      .from("studio_artifacts")
      .select("text")
      .eq("id", String(context.artifact_id))
      .maybeSingle();
    if (!voice?.text || !words.length) return { ok: false, error: "Aucune parole détectée." };

    const cues = buildCues(alignScriptToWords(voice.text, words));
    const srt = toSrt(cues);
    const { data: inserted } = await supabaseAdmin
      .from("studio_artifacts")
      .insert({
        conversation_id: gen.conversation_id,
        kind: "captions",
        title: "Sous-titres (SRT)",
        text: srt,
        generation_id: gen.id,
        pinned: true,
        meta: { cues: cues.length, voiceover_artifact_id: context.artifact_id },
      })
      .select("id")
      .single();
    if (!inserted) return { ok: false, error: "Les sous-titres n'ont pas pu être enregistrés." };
    return { ok: true, artifactId: inserted.id };
  }

  /* ----- images ----- */
  const url = imageUrlOf(tool, result.data);
  if (!url) return { ok: false, error: "Aucune image reçue." };
  const image = await downloadImage(url);
  if (!image) return { ok: false, error: "L'image n'a pas pu être téléchargée." };

  const path = `${gen.user_id}/${randomUUID()}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(STUDIO_BUCKET)
    .upload(path, image, { contentType: "image/png", upsert: false });
  if (uploadError) {
    console.error("Studio: image upload failed", uploadError.message);
    return { ok: false, error: "L'image n'a pas pu être conservée." };
  }

  const lines = (context.lines ?? {}) as Record<string, string>;
  const titles: Record<string, string> = {
    poster: `Affiche (${POSTER_FORMATS[(context.format as PosterFormat) ?? "4x5"].label})`,
    greeting: "Affiche de voeux",
    cutout: "Photo détourée",
  };
  const shown =
    tool === "poster"
      ? [lines.headline, lines.place, lines.price].filter(Boolean).join(" · ")
      : tool === "greeting"
        ? [lines.headline, lines.subline].filter(Boolean).join(" · ")
        : "Fond retiré, PNG transparent";

  const { data: inserted } = await supabaseAdmin
    .from("studio_artifacts")
    .insert({
      conversation_id: gen.conversation_id,
      kind: "image",
      title: titles[tool],
      text: shown,
      generation_id: gen.id,
      output_path: path,
      pinned: true,
      meta: { tool, format: context.format ?? null, check: null },
    })
    .select("id")
    .single();
  if (!inserted) return { ok: false, error: "L'image n'a pas pu être enregistrée." };

  // Automatic text check for posters. A failed check never blocks the image.
  if (tool === "poster" || tool === "greeting") {
    const read = await readPosterText(image);
    const check: PosterCheck | { status: "unavailable" } = read
      ? comparePosterText(read, (context.expected ?? {}) as ExpectedText)
      : { status: "unavailable" };
    await supabaseAdmin
      .from("studio_artifacts")
      .update({ meta: { tool, format: context.format ?? null, check } })
      .eq("id", inserted.id);
  }

  await supabaseAdmin
    .from("studio_generations")
    .update({ output_path: path })
    .eq("id", gen.id);
  return { ok: true, artifactId: inserted.id };
}
