import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canAcceptVoiceTerms } from "@/lib/studio/voices";
import {
  CURRENT_TERMS_VERSION,
  currentTermsHash,
  loadVoiceById,
} from "@/lib/studio/voices-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

// The owner of a locked voice accepts the terms, which records the consent
// and unlocks the voice in one database transaction.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (body?.accepted !== true) {
    return errorResponse("Vous devez accepter les conditions.", 400, req);
  }
  // The person accepted the text they were shown; refuse if it has changed.
  if (body?.terms_version !== CURRENT_TERMS_VERSION) {
    return errorResponse(
      "Les conditions ont changé. Rechargez la page et relisez-les.",
      409,
      req,
    );
  }

  const voice = await loadVoiceById(id);
  if (!voice || !canAcceptVoiceTerms(staff, voice)) {
    return errorResponse("Cette voix ne peut pas être acceptée.", 403, req);
  }

  const { data: consentId, error } = await supabaseAdmin.rpc(
    "accept_studio_voice_consent",
    {
      p_voice_id: voice.id,
      p_user_id: staff.id,
      p_terms_version: CURRENT_TERMS_VERSION,
      p_terms_hash: currentTermsHash(),
      p_ip: clientIp(req),
      p_user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
  );
  if (error) {
    console.error("Studio: accept voice consent failed", error.code);
    return errorResponse("L'acceptation n'a pas pu être enregistrée.", 500, req);
  }
  if (!consentId) {
    return errorResponse("Cette voix ne peut pas être acceptée.", 409, req);
  }

  return cors(NextResponse.json({ ok: true }), req);
}
