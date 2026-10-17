import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWriteConversation,
  loadConversation,
} from "@/lib/studio/conversations-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type Ctx = { params: Promise<{ id: string }> };

async function ownArtifact(req: Request, id: string) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return { error: errorResponse("Forbidden", 403, req) } as const;

  const { data: artifact } = await supabaseAdmin
    .from("studio_artifacts")
    .select("id, conversation_id")
    .eq("id", id)
    .maybeSingle();
  const conv = artifact ? await loadConversation(artifact.conversation_id) : null;
  if (!artifact || !conv || !canWriteConversation(staff, conv)) {
    return { error: errorResponse("Élément introuvable", 404, req) } as const;
  }
  return { artifact } as const;
}

// Pin or unpin an artifact in its conversation.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await ownArtifact(req, id);
  if ("error" in found) return found.error;

  const body = await req.json().catch(() => null);
  if (typeof body?.pinned !== "boolean") {
    return errorResponse("Valeur invalide", 400, req);
  }
  const { error } = await supabaseAdmin
    .from("studio_artifacts")
    .update({ pinned: body.pinned })
    .eq("id", id);
  if (error) return errorResponse("Mise à jour impossible", 500, req);
  return cors(NextResponse.json({ ok: true }), req);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await ownArtifact(req, id);
  if ("error" in found) return found.error;

  const { error } = await supabaseAdmin
    .from("studio_artifacts")
    .delete()
    .eq("id", id);
  if (error) return errorResponse("Suppression impossible", 500, req);
  return cors(NextResponse.json({ ok: true }), req);
}
