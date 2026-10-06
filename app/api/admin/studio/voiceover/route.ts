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
import { isVoiceUsable, STUDIO_TTS_MODEL } from "@/lib/studio/voices";
import { loadVoiceByKey } from "@/lib/studio/voices-server";
import { synthesizeSpeech } from "@/lib/studio/cartesia-tts";
import {
  canWriteConversation,
  loadConversation,
} from "@/lib/studio/conversations-server";

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
  if (!Number.isFinite(acknowledged)) {
    return errorResponse("Prix non confirmé", 400, req);
  }

  // A voice must exist and be active: locked, pending and revoked voices
  // cannot speak, and no raw Cartesia id is ever accepted from the client.
  const voice =
    typeof body?.voice === "string" ? await loadVoiceByKey(body.voice) : null;
  if (!voice || !isVoiceUsable(voice)) {
    return errorResponse("Voix non autorisée", 400, req);
  }
  // Optional: save the result as a pinned artifact of one of the person's
  // own conversations.
  const conversation =
    typeof body?.conversation_id === "string"
      ? await loadConversation(body.conversation_id)
      : null;
  if (body?.conversation_id && (!conversation || !canWriteConversation(staff, conversation))) {
    return errorResponse("Conversation introuvable", 404, req);
  }

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
    "reserve_studio_spend",
    {
      p_user_id: staff.id,
      p_kind: "voiceover",
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
    const speech = await synthesizeSpeech({
      apiKey,
      cartesiaVoiceId: voice.cartesiaVoiceId,
      text: spoken,
    });
    if (!speech.ok) {
      console.error("Studio: Cartesia returned", speech.status);
      return await fail(`cartesia ${speech.status}`);
    }

    const audio = speech.audio;
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
      .update({
        status: "done",
        output_path: path,
        voice_id: voice.id,
        conversation_id: conversation?.id ?? null,
        property_id: conversation?.property_id ?? null,
      })
      .eq("id", reservationId);

    let artifactId: string | null = null;
    if (conversation) {
      const { data: artifact } = await supabaseAdmin
        .from("studio_artifacts")
        .insert({
          conversation_id: conversation.id,
          kind: "voiceover",
          title: `Voix off (${voice.label})`,
          text,
          generation_id: reservationId,
          voice_key: voice.key,
          output_path: path,
          pinned: true,
        })
        .select("id")
        .single();
      artifactId = artifact?.id ?? null;
      await supabaseAdmin
        .from("studio_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation.id);
    }

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
        artifactId,
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
