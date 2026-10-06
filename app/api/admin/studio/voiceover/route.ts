import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { checkRateLimit, studioLimiter } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  acknowledgedCoversServerPrice,
  estimateVoiceoverCostUsd,
  startOfMonthIso,
} from "@/lib/studio/budget";
import {
  getMonthlyCapUsd,
  loadGlossary,
  STUDIO_BUCKET,
} from "@/lib/studio/server";
import { MAX_TTS_CHARACTERS, prepareForSpeech } from "@/lib/studio/tts-prepare";
import {
  isStudioVoiceKey,
  STUDIO_LANGUAGE,
  STUDIO_TTS_MODEL,
  STUDIO_VOICES,
} from "@/lib/studio/voices";

export const maxDuration = 60;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const limit = await checkRateLimit(studioLimiter, staff.id);
  if (!limit.success) {
    return errorResponse(
      "Trop de demandes. Réessayez dans quelques minutes.",
      429,
      req,
    );
  }

  const apiKey = process.env.CARTESIA_CONTENT_KEY;
  if (!apiKey) {
    console.error("Studio: CARTESIA_CONTENT_KEY is not configured");
    return errorResponse("Le Studio n'est pas encore configuré.", 503, req);
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const acknowledged = Number(body?.acknowledged_cost_usd);
  if (!text) return errorResponse("Le texte est vide.", 400, req);
  if (!isStudioVoiceKey(body?.voice)) {
    return errorResponse("Voix non autorisée", 400, req);
  }
  if (!Number.isFinite(acknowledged)) {
    return errorResponse("Prix non confirmé", 400, req);
  }

  const voice = STUDIO_VOICES[body.voice as keyof typeof STUDIO_VOICES];
  const spoken = prepareForSpeech(text, await loadGlossary());
  if (spoken.length > MAX_TTS_CHARACTERS) {
    return errorResponse(
      `Le texte est trop long (${MAX_TTS_CHARACTERS} caractères au maximum).`,
      400,
      req,
    );
  }

  const serverPrice = estimateVoiceoverCostUsd(spoken.length);
  if (!acknowledgedCoversServerPrice(acknowledged, serverPrice)) {
    return cors(
      NextResponse.json(
        { error: "Le prix a changé.", code: "price_changed", estimateUsd: serverPrice },
        { status: 409 },
      ),
      req,
    );
  }

  const capUsd = await getMonthlyCapUsd(staff.id);
  const { data: reservationId, error: reserveError } = await supabaseAdmin.rpc(
    "reserve_studio_voiceover",
    {
      p_user_id: staff.id,
      p_voice: body.voice,
      p_model: STUDIO_TTS_MODEL,
      p_input: { display_text: text, spoken_text: spoken },
      p_est_cost_usd: serverPrice,
      p_cap_usd: capUsd,
      p_month_start: startOfMonthIso(),
    },
  );
  if (reserveError) {
    return errorResponse(safeError(reserveError, "Erreur du Studio"), 500, req);
  }
  if (!reservationId) {
    return errorResponse(
      "Plafond mensuel atteint. Demandez à Salif de le relever.",
      402,
      req,
    );
  }

  const fail = async (message: string, status = 502) => {
    await supabaseAdmin
      .from("studio_generations")
      .update({ status: "failed", error: message.slice(0, 300) })
      .eq("id", reservationId);
    return errorResponse(
      "La voix n'a pas pu être générée. Réessayez.",
      status,
      req,
    );
  };

  try {
    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cartesia-Version": "2025-04-16",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        model_id: STUDIO_TTS_MODEL,
        transcript: spoken,
        voice: { mode: "id", id: voice.id },
        language: STUDIO_LANGUAGE,
        output_format: {
          container: "mp3",
          sample_rate: 44100,
          bit_rate: 128000,
        },
      }),
    });

    if (!response.ok) {
      // Status only: the response body may echo request details.
      console.error("Studio: Cartesia returned", response.status);
      return await fail(`cartesia ${response.status}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    const path = `${staff.id}/${randomUUID()}.mp3`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(STUDIO_BUCKET)
      .upload(path, audio, { contentType: "audio/mpeg", upsert: false });
    if (uploadError) {
      console.error("Studio: upload failed", uploadError.message);
      return await fail("upload failed", 500);
    }

    await supabaseAdmin
      .from("studio_generations")
      .update({ status: "done", output_path: path })
      .eq("id", reservationId);

    const { data: signed } = await supabaseAdmin.storage
      .from(STUDIO_BUCKET)
      .createSignedUrl(path, 3600);
    const { data: download } = await supabaseAdmin.storage
      .from(STUDIO_BUCKET)
      .createSignedUrl(path, 3600, {
        download: `Roogo - Voix off (${voice.label}).mp3`,
      });

    return cors(
      NextResponse.json({
        id: reservationId,
        voice: body.voice,
        costUsd: serverPrice,
        url: signed?.signedUrl ?? null,
        downloadUrl: download?.signedUrl ?? null,
      }),
      req,
    );
  } catch (error) {
    console.error("Studio: voiceover failed", error);
    return await fail("unexpected error", 500);
  }
}
