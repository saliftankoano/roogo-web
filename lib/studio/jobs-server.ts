import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  FAL_ENDPOINTS,
  POSTER_FORMATS,
  estimateJobCostUsd,
  pickPosterFormat,
  type JobTool,
  type PosterFormat,
  type PosterQuality,
} from "./ai-tools";
import { alignScriptToWords, buildCues, toSrt } from "./captions";
import { normalizeScript } from "./copy-rules";
import { buildMusicPrompt, generatedTitle, isMusicMood } from "./music";
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
  chooseDesign,
  cleanPosterLine,
  familyById,
  fitGreetingText,
  inferSubject,
  isStyleFamily,
  type PastDesign,
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

/** Art direction of this project's latest free posters, newest first. */
async function recentFreePosterDesigns(conversationId: string): Promise<PastDesign[]> {
  const { data, error } = await supabaseAdmin
    .from("studio_artifacts")
    .select("meta")
    .eq("conversation_id", conversationId)
    .eq("kind", "image")
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) {
    console.error("Studio: recent poster designs read failed", error.code);
    return [];
  }
  const designs: PastDesign[] = [];
  for (const row of data ?? []) {
    const meta = (row.meta ?? {}) as { tool?: string; design?: { family?: string; background?: string } };
    if (meta.tool === "greeting" && meta.design?.family) {
      designs.push({ family: meta.design.family, background: meta.design.background ?? null });
    }
  }
  return designs;
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

    const format: PosterFormat = pickPosterFormat(params.format);
    const quality = pickQuality(params.quality);
    const defaults = posterDefaults(row);
    const given = (params.lines ?? {}) as Record<string, unknown>;
    const lines = {
      headline: cleanPosterLine(normalizeScript(asString(given.headline, 200) || defaults.headline)),
      place: cleanPosterLine(normalizeScript(asString(given.place, 200) || defaults.place)),
      price: cleanPosterLine(normalizeScript(asString(given.price, 200) || defaults.price)),
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
    const format: PosterFormat = pickPosterFormat(params.format);
    // Generous limits: the text is fitted (word boundary, no emoji) below, and
    // the form shows the same fit before anyone presses the button.
    const typedHeadline = normalizeScript(asString(params.headline, 400));
    const typedSubline = normalizeScript(asString(params.subline, 300));
    const fitted = fitGreetingText({ headline: typedHeadline, subline: typedSubline });
    if (!fitted.headline.text) return fail(400, "Écrivez le message principal.");
    const size = POSTER_FORMATS[format];
    const subject = inferSubject(typedHeadline, typedSubline);
    const avoid = Array.isArray(params.avoid) ? params.avoid.filter(isStyleFamily) : [];
    const design = chooseDesign({
      subject,
      ratio: size.ratio,
      recent: await recentFreePosterDesigns(conversation.id),
      avoid,
      requested: isStyleFamily(params.style) ? params.style : null,
    });
    const headline = fitted.headline.text;
    const subline = fitted.subline.text;
    // The check compares the image with what was TYPED, not the fitted text.
    const expected: ExpectedText = {
      lines: [
        { typed: typedHeadline, sent: headline },
        ...(typedSubline.trim() ? [{ typed: typedSubline, sent: subline }] : []),
      ],
    };
    return {
      ok: true,
      job: {
        tool,
        endpoint,
        input: {
          prompt: buildGreetingPrompt({ headline, subline }, size.ratio, design),
          aspect_ratio: size.ratio,
          resolution: "1K",
          num_images: 1,
          output_format: "png",
        },
        estimateUsd: estimateJobCostUsd({ tool }),
        context: {
          tool,
          format,
          design,
          subject,
          lines: { headline, subline },
          typed: { headline: typedHeadline, subline: typedSubline },
          shortened: fitted.headline.shortened || fitted.subline.shortened,
          expected,
        },
      },
    };
  }

  if (tool === "music") {
    const mood = isMusicMood(params.mood) ? params.mood : null;
    const details = asString(params.details, 240);
    if (!mood && !details) return fail(400, "Choisissez une ambiance ou décrivez la musique.");
    return {
      ok: true,
      job: {
        tool,
        endpoint,
        input: { prompt: buildMusicPrompt(mood, details) },
        estimateUsd: estimateJobCostUsd({ tool }),
        context: { tool, mood, details, title: generatedTitle(mood, details) },
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

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

async function downloadAudio(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length <= MAX_AUDIO_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/** Length of a constant-bitrate MP3 from its first frame header (Lyria returns 192 kbps CBR). */
function mp3Seconds(bytes: Buffer): number | null {
  const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  let i = 0;
  if (bytes.subarray(0, 3).toString("latin1") === "ID3" && bytes.length > 10) {
    i = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
  }
  for (; i < Math.min(bytes.length - 4, i + 64 * 1024); i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
      const kbps = KBPS[(bytes[i + 2] >> 4) & 0x0f];
      if (kbps) return Math.round(((bytes.length - i) * 8) / (kbps * 1000) * 100) / 100;
    }
  }
  return null;
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
          ? tool === "music"
            ? "La musique a été refusée par le filtre de sécurité. Changez la description."
            : "L'image a été refusée par le filtre de sécurité. Changez le texte ou la photo."
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

  /* ----- music: joins the team library, not the project ----- */
  if (tool === "music") {
    const url = (result.data.audio as { url?: string } | undefined)?.url;
    if (!url) return { ok: false, error: "Aucune musique reçue." };
    const audio = await downloadAudio(url);
    if (!audio) return { ok: false, error: "La musique n'a pas pu être téléchargée." };
    const path = `music/generated/${randomUUID()}.mp3`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(STUDIO_BUCKET)
      .upload(path, audio, { contentType: "audio/mpeg", upsert: false });
    if (uploadError) {
      console.error("Studio: music upload failed", uploadError.message);
      return { ok: false, error: "La musique n'a pas pu être conservée." };
    }
    const { data: track } = await supabaseAdmin
      .from("studio_music_tracks")
      .insert({
        title: String(context.title ?? "Musique générée").slice(0, 120),
        source: "generated",
        prompt: typeof context.details === "string" ? context.details : null,
        duration_seconds: mp3Seconds(audio),
        storage_path: path,
        created_by: gen.user_id,
        generation_id: gen.id,
      })
      .select("id")
      .single();
    if (!track) return { ok: false, error: "La musique n'a pas pu être enregistrée." };
    await supabaseAdmin.from("studio_generations").update({ output_path: path }).eq("id", gen.id);
    return { ok: true, artifactId: track.id };
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
    poster: `Affiche (${POSTER_FORMATS[pickPosterFormat(context.format)].label})`,
    greeting: `Affiche libre (${POSTER_FORMATS[pickPosterFormat(context.format)].label})`,
    cutout: "Photo détourée",
  };
  const shown =
    tool === "poster"
      ? [lines.headline, lines.place, lines.price].filter(Boolean).join(" · ")
      : tool === "greeting"
        ? [lines.headline, lines.subline].filter(Boolean).join(" · ")
        : "Fond retiré, PNG transparent";

  const design = (context.design ?? null) as { family?: string } | null;
  const baseMeta: Record<string, unknown> = {
    tool,
    format: context.format ?? null,
    check: null,
    ...(tool === "greeting"
      ? {
          design,
          family_label: design?.family ? (familyById(design.family)?.label ?? null) : null,
          subject: context.subject ?? null,
          typed: context.typed ?? null,
          shortened: Boolean(context.shortened),
        }
      : {}),
  };
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
      meta: baseMeta,
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
      .update({ meta: { ...baseMeta, check } })
      .eq("id", inserted.id);
  }

  await supabaseAdmin
    .from("studio_generations")
    .update({ output_path: path })
    .eq("id", gen.id);
  return { ok: true, artifactId: inserted.id };
}
