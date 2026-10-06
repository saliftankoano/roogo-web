import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { isVoiceCloningEnabled } from "@/lib/studio/flags";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildChallengeSentence,
  CHALLENGE_TTL_MINUTES,
  generateCode,
  READ_ALOUD_PARAGRAPH,
} from "@/lib/studio/consent";
import { canOwnAnotherVoice } from "@/lib/studio/voices";
import { MAX_CLONE_SECONDS, MIN_CLONE_SECONDS } from "@/lib/studio/wav";
import { loadVoices } from "@/lib/studio/voices-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Starts a cloning attempt: a fresh sentence and code to read aloud at the
// start of the recording. Refused up front if the person already has a voice.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  if (!isVoiceCloningEnabled()) {
    return errorResponse("La création de voix n'est pas encore ouverte.", 404, req);
  }

  const voices = await loadVoices();
  if (!canOwnAnotherVoice(staff.id, voices)) {
    return errorResponse(
      "Vous avez déjà une voix. Retirez-la d'abord pour en créer une nouvelle.",
      409,
      req,
    );
  }

  const code = generateCode();
  const now = new Date();
  const sentence = buildChallengeSentence(staff.full_name ?? "", code, now);

  const { data, error } = await supabaseAdmin
    .from("studio_voice_challenges")
    .insert({
      user_id: staff.id,
      sentence,
      code,
      expires_at: new Date(
        now.getTime() + CHALLENGE_TTL_MINUTES * 60_000,
      ).toISOString(),
    })
    .select("id, expires_at")
    .single();
  if (error || !data) {
    console.error("Studio: challenge insert failed", error?.code);
    return errorResponse("Le défi n'a pas pu être créé.", 500, req);
  }

  return cors(
    NextResponse.json({
      id: data.id,
      sentence,
      paragraph: READ_ALOUD_PARAGRAPH,
      expiresAt: data.expires_at,
      minSeconds: MIN_CLONE_SECONDS,
      maxSeconds: MAX_CLONE_SECONDS,
    }),
    req,
  );
}
