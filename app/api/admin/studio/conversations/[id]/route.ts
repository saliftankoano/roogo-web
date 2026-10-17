import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { stripScriptBlocks } from "@/lib/studio/chat-prompt";
import {
  canReadConversation,
  canWriteConversation,
  loadConversation,
  loadPropertyRow,
  propertyLabels,
} from "@/lib/studio/conversations-server";
import { propertyTitle, toPropertySummary } from "@/lib/studio/property-context";
import { STUDIO_BUCKET } from "@/lib/studio/server";
import { isVoiceUsable } from "@/lib/studio/voices";
import { loadVoiceByKey } from "@/lib/studio/voices-server";
import { videoDownloadName } from "@/lib/studio/video-templates";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const { id } = await params;
  const conv = await loadConversation(id);
  if (!conv || !canReadConversation(staff, conv)) {
    return errorResponse("Conversation introuvable", 404, req);
  }

  const [{ data: messages }, { data: artifacts }, property] = await Promise.all([
    supabaseAdmin
      .from("studio_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("studio_artifacts")
      .select("id, kind, title, text, voice_key, output_path, pinned, created_at, meta")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
    conv.property_id ? loadPropertyRow(conv.property_id) : Promise.resolve(null),
  ]);

  // Jobs still running (for example after a page reload) so the page resumes polling.
  const { data: runningJobs } = await supabaseAdmin
    .from("studio_generations")
    .select("id, kind, input")
    .eq("conversation_id", id)
    .in("kind", ["image", "transcription"])
    .in("status", ["running", "finalizing"]);

  const storage = supabaseAdmin.storage.from(STUDIO_BUCKET);
  const artifactItems = await Promise.all(
    (artifacts ?? []).map(async (artifact) => {
      let url: string | null = null;
      let downloadUrl: string | null = null;
      if (
        (artifact.kind === "voiceover" || artifact.kind === "image" || artifact.kind === "video") &&
        artifact.output_path
      ) {
        const filename =
          artifact.kind === "image"
            ? `Roogo - ${String(artifact.title).replace(/[^\p{L}\p{N} ()-]/gu, "")}.png`
            : artifact.kind === "video"
              ? videoDownloadName(String(artifact.text ?? ""), String(artifact.title ?? ""))
              : "Roogo - Voix off.mp3";
        const [play, download] = await Promise.all([
          storage.createSignedUrl(artifact.output_path, 3600),
          storage.createSignedUrl(artifact.output_path, 3600, { download: filename }),
        ]);
        url = play.data?.signedUrl ?? null;
        downloadUrl = download.data?.signedUrl ?? null;
      }
      return {
        id: artifact.id,
        kind: artifact.kind,
        title: artifact.title,
        text: artifact.text,
        voiceKey: artifact.voice_key,
        pinned: artifact.pinned,
        createdAt: artifact.created_at,
        meta: artifact.meta ?? {},
        url,
        downloadUrl,
      };
    }),
  );

  return cors(
    NextResponse.json({
      conversation: {
        id: conv.id,
        title: conv.title,
        propertyId: conv.property_id,
        voiceKey: conv.voice_key,
        isMine: conv.user_id === staff.id,
      },
      property: property ? toPropertySummary(property, propertyLabels) : null,
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        // The script itself lives in the artifacts panel, not in the bubble.
        content:
          m.role === "assistant" ? stripScriptBlocks(m.content) : m.content,
        createdAt: m.created_at,
      })),
      artifacts: artifactItems,
      jobs: (runningJobs ?? []).map((job) => ({
        id: job.id,
        tool: (job.input as { context?: { tool?: string } } | null)?.context?.tool ?? null,
      })),
    }),
    req,
  );
}

// Change the property, the voice, the title, or archive the conversation.
export async function PATCH(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const { id } = await params;
  const conv = await loadConversation(id);
  if (!conv || !canWriteConversation(staff, conv)) {
    return errorResponse("Conversation introuvable", 404, req);
  }

  const body = await req.json().catch(() => null);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body?.property_id === "string") {
    const property = await loadPropertyRow(body.property_id);
    if (!property) return errorResponse("Bien introuvable", 404, req);
    // A project belongs to one property (Salif, 2026-10-10): once it has results,
    // its property is fixed, or one listing's voice and posters show on another.
    if (conv.property_id && conv.property_id !== property.id) {
      const { count } = await supabaseAdmin
        .from("studio_artifacts")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id);
      if ((count ?? 0) > 0) {
        return errorResponse("Ce projet a déjà des résultats : créez un nouveau projet pour ce bien.", 409, req);
      }
    }
    update.property_id = property.id;
    if (conv.title === "Nouvelle conversation") {
      update.title = propertyTitle(property, propertyLabels);
    }
  }
  if (typeof body?.title === "string" && body.title.trim()) {
    update.title = body.title.trim().slice(0, 80);
  }
  if (typeof body?.voice_key === "string") {
    const voice = await loadVoiceByKey(body.voice_key);
    if (!voice || !isVoiceUsable(voice)) {
      return errorResponse("Voix non autorisée", 400, req);
    }
    update.voice_key = voice.key;
  }
  if (body?.archived === true) update.archived_at = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("studio_conversations")
    .update(update)
    .eq("id", id);
  if (error) return errorResponse("Mise à jour impossible", 500, req);

  return cors(NextResponse.json({ ok: true }), req);
}
