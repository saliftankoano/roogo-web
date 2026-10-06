import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canRevokeVoice } from "@/lib/studio/voices";
import {
  deleteCartesiaVoice,
  loadVoiceById,
} from "@/lib/studio/voices-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The owner (or a founder) withdraws a voice. It stops being usable at once
// and the owner's single voice slot is freed. A voice the Studio cloned is
// also deleted at Cartesia; a voice that already existed there is only
// switched off here, because it may be used elsewhere.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : "Retrait demandé dans le Studio";

  const voice = await loadVoiceById(id);
  if (!voice) return errorResponse("Voix introuvable", 404, req);
  if (voice.ownerUserId === null) {
    return errorResponse("Cette voix n'a pas de propriétaire.", 400, req);
  }
  if (!canRevokeVoice(staff, voice)) {
    return errorResponse(
      "Vous ne pouvez retirer que votre propre voix.",
      403,
      req,
    );
  }

  const { data, error } = await supabaseAdmin.rpc("revoke_studio_voice", {
    p_voice_id: voice.id,
    p_actor_id: staff.id,
    p_actor_is_founder: staff.user_type === "founder",
    p_reason: reason,
  });
  if (error) {
    console.error("Studio: revoke voice failed", error.code);
    return errorResponse("Le retrait n'a pas pu être enregistré.", 500, req);
  }
  const revoked = Array.isArray(data) ? data[0] : null;
  if (!revoked) {
    return errorResponse("Cette voix est déjà retirée.", 409, req);
  }

  // The voice is already unusable. Now remove a Studio-made clone at Cartesia.
  let providerDeleted: boolean | null = null;
  if (revoked.kind === "cloned") {
    providerDeleted = await deleteCartesiaVoice(revoked.cartesia_voice_id);
    if (providerDeleted) {
      await supabaseAdmin
        .from("studio_voice_consents")
        .update({ cartesia_deleted_at: new Date().toISOString() })
        .eq("voice_id", voice.id)
        .is("cartesia_deleted_at", null);
    } else {
      console.error("Studio: Cartesia delete pending for a revoked voice");
    }
  }

  return cors(
    NextResponse.json({
      ok: true,
      // false means the voice is switched off here but still has to be
      // deleted at Cartesia (a founder can retry from the Cartesia console).
      providerDeleted,
    }),
    req,
  );
}
