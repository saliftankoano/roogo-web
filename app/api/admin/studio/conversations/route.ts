import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { propertyTitle } from "@/lib/studio/property-context";
import {
  CONVERSATION_COLUMNS,
  loadPropertyRow,
  propertyLabels,
} from "@/lib/studio/conversations-server";
import { loadVoiceByKey } from "@/lib/studio/voices-server";
import { projectContains, projectKind, projectSummary, type ArtifactRow } from "@/lib/studio/history";
import { isVoiceUsable } from "@/lib/studio/voices";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// History: every staff project, newest first (decision of 2026-10-09: the
// whole team sees all projects in V1; only the author can change one). Each
// row says who started it, when, what kind it is and its latest result.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const { data, error } = await supabaseAdmin
    .from("studio_conversations")
    .select(`${CONVERSATION_COLUMNS}, users(full_name)`)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return errorResponse("Historique indisponible", 500, req);

  const ids = (data ?? []).map((row) => row.id);
  const { data: artifacts } = ids.length
    ? await supabaseAdmin
        .from("studio_artifacts")
        .select("conversation_id, kind, title, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: true })
    : { data: [] as ArtifactRow[] };
  const byConversation = new Map<string, ArtifactRow[]>();
  for (const row of (artifacts ?? []) as ArtifactRow[]) {
    byConversation.set(row.conversation_id, [...(byConversation.get(row.conversation_id) ?? []), row]);
  }

  const conversations = (data ?? []).map((row) => {
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    const rows = byConversation.get(row.id) ?? [];
    return {
      id: row.id,
      title: row.title,
      propertyId: row.property_id,
      voiceKey: row.voice_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: author?.full_name ?? null,
      isMine: row.user_id === staff.id,
      kind: projectKind(rows.map((r) => r.kind)),
      contains: projectContains(rows.map((r) => r.kind)),
      summary: projectSummary(rows),
    };
  });
  return cors(NextResponse.json({ conversations }), req);
}

export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const body = await req.json().catch(() => null);
  let title = "Nouvelle conversation";
  let propertyId: string | null = null;

  if (typeof body?.property_id === "string") {
    const property = await loadPropertyRow(body.property_id);
    if (!property) return errorResponse("Bien introuvable", 404, req);
    propertyId = property.id;
    title = propertyTitle(property, propertyLabels);
  }

  // A visuals-only project names itself (no property to name it after).
  if (!propertyId && typeof body?.title === "string" && body.title.trim()) {
    title = body.title.trim().replace(/[\u2014]/g, ",").slice(0, 80);
  }

  let voiceKey: string | null = null;
  if (typeof body?.voice_key === "string") {
    const voice = await loadVoiceByKey(body.voice_key);
    if (voice && isVoiceUsable(voice)) voiceKey = voice.key;
  }

  const { data, error } = await supabaseAdmin
    .from("studio_conversations")
    .insert({
      user_id: staff.id,
      property_id: propertyId,
      title,
      voice_key: voiceKey,
    })
    .select(CONVERSATION_COLUMNS)
    .single();
  if (error || !data) {
    console.error("Studio: create conversation failed", error?.code);
    return errorResponse("La conversation n'a pas pu être créée.", 500, req);
  }

  return cors(NextResponse.json({ id: data.id, title: data.title }, { status: 201 }), req);
}
