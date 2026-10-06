import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { estimateVoiceoverCostUsd } from "@/lib/studio/budget";
import { fcfaPerUsd } from "@/lib/studio/currency";
import {
  getMonthlyCapUsd,
  getUsedThisMonthUsd,
  loadGlossary,
} from "@/lib/studio/server";
import { MAX_TTS_CHARACTERS, prepareForSpeech } from "@/lib/studio/tts-prepare";
import { isStudioVoiceKey } from "@/lib/studio/voices";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Pure price preview: writes nothing. Called live as the text changes so the
// price is visible before the generate button is pressed.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  if (!isStudioVoiceKey(body?.voice)) {
    return errorResponse("Voix non autorisée", 400, req);
  }

  const [glossary, capUsd, usedUsd] = await Promise.all([
    loadGlossary(),
    getMonthlyCapUsd(staff.id),
    getUsedThisMonthUsd(staff.id),
  ]);
  const spoken = prepareForSpeech(text, glossary);

  return cors(
    NextResponse.json({
      spokenCharacters: spoken.length,
      maxCharacters: MAX_TTS_CHARACTERS,
      tooLong: spoken.length > MAX_TTS_CHARACTERS,
      estimateUsd: estimateVoiceoverCostUsd(spoken.length),
      capUsd,
      usedUsd,
      remainingUsd: Math.max(0, capUsd - usedUsd),
      fcfaPerUsd: fcfaPerUsd(process.env.STUDIO_FCFA_PER_USD),
    }),
    req,
  );
}
