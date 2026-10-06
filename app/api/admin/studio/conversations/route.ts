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
import { isVoiceUsable } from "@/lib/studio/voices";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// History: the person's own conversations, newest first. A founder can ask
// for everyone's with ?all=1.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const wantsAll =
    new URL(req.url).searchParams.get("all") === "1" &&
    staff.user_type === "founder";

  let query = supabaseAdmin
    .from("studio_conversations")
    .select(`${CONVERSATION_COLUMNS}, users(full_name)`)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(60);
  if (!wantsAll) query = query.eq("user_id", staff.id);

  const { data, error } = await query;
  if (error) return errorResponse("Historique indisponible", 500, req);

  const conversations = (data ?? []).map((row) => {
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      id: row.id,
      title: row.title,
      propertyId: row.property_id,
      voiceKey: row.voice_key,
      updatedAt: row.updated_at,
      author: wantsAll ? (author?.full_name ?? null) : null,
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
