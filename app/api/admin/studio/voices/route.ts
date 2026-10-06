import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { isVoiceCloningEnabled } from "@/lib/studio/flags";
import {
  TERMS_CHECKBOX_LABEL,
  TERMS_PARAGRAPHS,
  TERMS_TITLE,
} from "@/lib/studio/consent-terms";
import {
  canAcceptVoiceTerms,
  canRevokeVoice,
  visibleVoices,
} from "@/lib/studio/voices";
import {
  CURRENT_TERMS_VERSION,
  loadVoices,
} from "@/lib/studio/voices-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Voices the viewer can see: every usable voice, plus their own voice even
// when it is still locked (so they can accept the terms and unlock it).
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const all = await loadVoices();
  const voices = visibleVoices(staff, all).map((voice) => ({
    id: voice.id,
    key: voice.key,
    label: voice.label,
    description: voice.description,
    kind: voice.kind,
    status: voice.status,
    isMine: voice.ownerUserId === staff.id,
    canAccept: canAcceptVoiceTerms(staff, voice),
    // Ownerless voices (the house voice) are never withdrawn from the UI.
    canRevoke: voice.ownerUserId !== null && canRevokeVoice(staff, voice),
  }));

  return cors(
    NextResponse.json({
      voices,
      cloningEnabled: isVoiceCloningEnabled(),
      terms: {
        version: CURRENT_TERMS_VERSION,
        title: TERMS_TITLE,
        paragraphs: TERMS_PARAGRAPHS,
        checkboxLabel: TERMS_CHECKBOX_LABEL,
      },
    }),
    req,
  );
}
