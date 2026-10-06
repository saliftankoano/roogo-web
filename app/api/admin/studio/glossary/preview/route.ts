import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { checkRateLimit, studioPreviewLimiter } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  acknowledgedCoversServerPrice,
  estimateVoiceoverCostUsd,
  startOfMonthIso,
} from "@/lib/studio/budget";
import { synthesizeSpeech } from "@/lib/studio/cartesia-tts";
import { getMonthlyCapUsd } from "@/lib/studio/server";
import { isVoiceUsable, STUDIO_TTS_MODEL } from "@/lib/studio/voices";
import { loadVoiceByKey } from "@/lib/studio/voices-server";

export const maxDuration = 30;

const MAX_PREVIEW_CHARACTERS = 80;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// "Écouter": plays a short phrase in the chosen voice so staff can check a
// pronunciation by ear. The audio is returned directly and not stored. The
// cost is tiny but is counted toward the same monthly cap as a voice-over.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const limit = await checkRateLimit(studioPreviewLimiter, staff.id);
  if (!limit.success) {
    return errorResponse("Trop d'écoutes. Réessayez dans quelques minutes.", 429, req);
  }

  const apiKey = process.env.CARTESIA_CONTENT_KEY;
  if (!apiKey) return errorResponse("Le Studio n'est pas encore configuré.", 503, req);

  const body = await req.json().catch(() => null);
  const spokenForm = typeof body?.spoken === "string" ? body.spoken.trim() : "";
  const acknowledged = Number(body?.acknowledged_cost_usd);
  if (!spokenForm) return errorResponse("Rien à écouter.", 400, req);
  if (spokenForm.length > MAX_PREVIEW_CHARACTERS) {
    return errorResponse(
      `Trop long pour une écoute (${MAX_PREVIEW_CHARACTERS} caractères au maximum).`,
      400,
      req,
    );
  }
  if (!Number.isFinite(acknowledged)) {
    return errorResponse("Prix non confirmé", 400, req);
  }

  const voice =
    typeof body?.voice === "string" ? await loadVoiceByKey(body.voice) : null;
  if (!voice || !isVoiceUsable(voice)) {
    return errorResponse("Voix non autorisée", 400, req);
  }

  // A short carrier phrase gives the word a natural intonation.
  const phrase = `On dit : ${spokenForm}.`;
  const price = estimateVoiceoverCostUsd(phrase.length);
  if (!acknowledgedCoversServerPrice(acknowledged, price)) {
    return cors(
      NextResponse.json(
        { error: "Le prix a changé.", code: "price_changed", estimateUsd: price },
        { status: 409 },
      ),
      req,
    );
  }

  const { data: reservationId, error: reserveError } = await supabaseAdmin.rpc(
    "reserve_studio_spend",
    {
      p_user_id: staff.id,
      p_kind: "preview",
      p_voice: voice.key,
      p_model: STUDIO_TTS_MODEL,
      p_input: { spoken_text: phrase },
      p_est_cost_usd: price,
      p_cap_usd: await getMonthlyCapUsd(staff.id),
      p_month_start: startOfMonthIso(),
    },
  );
  if (reserveError) {
    console.error("Studio: preview reserve failed", reserveError.code);
    return errorResponse("Erreur du Studio", 500, req);
  }
  if (!reservationId) {
    return errorResponse(
      "Plafond mensuel atteint. Demandez à Salif de le relever.",
      402,
      req,
    );
  }

  const speech = await synthesizeSpeech({
    apiKey,
    cartesiaVoiceId: voice.cartesiaVoiceId,
    text: phrase,
  });
  if (!speech.ok) {
    console.error("Studio: preview Cartesia returned", speech.status);
    await supabaseAdmin
      .from("studio_generations")
      .update({ status: "failed", error: `cartesia ${speech.status}` })
      .eq("id", reservationId);
    return errorResponse("L'écoute n'a pas pu être générée.", 502, req);
  }

  await supabaseAdmin
    .from("studio_generations")
    .update({ status: "done", voice_id: voice.id })
    .eq("id", reservationId);

  const res = new NextResponse(new Uint8Array(speech.audio), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Studio-Cost-Usd": String(price),
    },
  });
  return cors(res, req);
}
