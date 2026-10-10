import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { checkRateLimit, studioJobLimiter } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { acknowledgedCoversServerPrice, startOfMonthIso } from "@/lib/studio/budget";
import {
  canWriteConversation,
  loadConversation,
  loadPropertyRow,
  propertyLabels,
} from "@/lib/studio/conversations-server";
import { heygenConfigured, submitRender } from "@/lib/studio/heygen-server";
import { CONTACT_PHONE, LOGO_URL } from "@/lib/studio/poster-prompt";
import { toPropertySummary } from "@/lib/studio/property-context";
import { STUDIO_BUCKET, getVideoCapUsd } from "@/lib/studio/server";
import {
  buildOutroOnly,
  buildVisitePov,
  clampVoiceDelay,
  defaultOutro,
  estimateVideoCostUsd,
  type OutroText,
} from "@/lib/studio/video-templates";

export const maxDuration = 30;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

const OUTRO_FIELDS: (keyof OutroText)[] = [
  "headline",
  "location",
  "price",
  "currency",
  "note",
  "contactLabel",
  "phone",
  "footer",
];

type Prepared = { html: string; durationSeconds: number; title: string; mode: "full" | "outro" };

// Builds the page for this conversation's property. Only the listing's own photos
// are accepted, whatever the browser sends.
async function prepare(
  body: Record<string, unknown>,
  conversation: NonNullable<Awaited<ReturnType<typeof loadConversation>>>,
): Promise<{ ok: true; job: Prepared } | { ok: false; status: number; error: string }> {
  if (!conversation.property_id) return { ok: false, status: 400, error: "Choisissez d'abord un bien." };
  const row = await loadPropertyRow(conversation.property_id);
  if (!row) return { ok: false, status: 404, error: "Bien introuvable." };
  const property = toPropertySummary(row, propertyLabels);
  const allowed = new Set(row.images ?? []);

  const base = defaultOutro(property, CONTACT_PHONE);
  const sent = (body.outro ?? {}) as Record<string, unknown>;
  const outro: OutroText = { ...base };
  for (const key of OUTRO_FIELDS) {
    if (typeof sent[key] === "string") (outro as Record<string, unknown>)[key] = (sent[key] as string).trim().slice(0, 80);
  }
  outro.backgroundUrl =
    sent.backgroundUrl === null ? null : typeof sent.backgroundUrl === "string" && allowed.has(sent.backgroundUrl) ? sent.backgroundUrl : base.backgroundUrl;

  const mode = body.mode === "outro" ? "outro" : "full";
  const shortTitle = property.title.split(",").slice(0, 2).join(",");
  if (mode === "outro") {
    const built = buildOutroOnly({ outro, logoUrl: LOGO_URL });
    return { ok: true, job: { ...built, mode, title: `Fin seule · ${shortTitle}` } };
  }

  const photos = Array.isArray(body.photos)
    ? (body.photos as unknown[]).filter((p): p is string => typeof p === "string" && allowed.has(p)).slice(0, 12)
    : [];
  if (!photos.length) return { ok: false, status: 400, error: "Ce bien n'a pas de photo utilisable." };

  const { data: artifacts } = await supabaseAdmin
    .from("studio_artifacts")
    .select("id, kind, text, output_path, pinned, created_at, meta")
    .eq("conversation_id", conversation.id)
    .in("kind", ["voiceover", "script"])
    .order("created_at", { ascending: false });
  const voice = (artifacts ?? []).find((a) => a.kind === "voiceover" && a.output_path);
  if (!voice) return { ok: false, status: 400, error: "Générez d'abord la voix off." };
  const scripts = (artifacts ?? []).filter((a) => a.kind === "script");
  const script = scripts.find((a) => a.pinned) ?? scripts[0];
  const voiceSeconds = Number((voice.meta as { duration_seconds?: number } | null)?.duration_seconds);
  if (!Number.isFinite(voiceSeconds) || voiceSeconds <= 0) {
    return { ok: false, status: 400, error: "La durée de la voix off est inconnue. Régénérez-la." };
  }
  // The render reads the audio once, early; three hours leaves room for HeyGen's queue.
  const { data: signed } = await supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUrl(voice.output_path!, 3 * 3600);
  if (!signed?.signedUrl) return { ok: false, status: 500, error: "La voix off n'est pas accessible." };

  const built = buildVisitePov({
    photos,
    voiceUrl: signed.signedUrl,
    voiceSeconds,
    voiceDelay: clampVoiceDelay(Number(body.voice_delay)),
    script: script?.text ?? undefined,
    logoUrl: LOGO_URL,
    outro,
  });
  return { ok: true, job: { html: built.html, durationSeconds: built.durationSeconds, mode, title: `Visite POV · ${shortTitle}` } };
}

// Starts a render. The price was on the button; pressing it is the confirmation.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const limit = await checkRateLimit(studioJobLimiter, staff.id);
  if (!limit.success) return errorResponse("Trop de demandes. Réessayez dans quelques minutes.", 429, req);
  if (!heygenConfigured()) {
    console.error("Studio: HEYGEN_API_KEY is not configured");
    return errorResponse("La création de vidéo n'est pas encore configurée.", 503, req);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const acknowledged = Number(body?.acknowledged_cost_usd);
  if (!body || !Number.isFinite(acknowledged)) return errorResponse("Prix non confirmé", 400, req);
  const conversation =
    typeof body.conversation_id === "string" ? await loadConversation(body.conversation_id) : null;
  if (!conversation || !canWriteConversation(staff, conversation)) {
    return errorResponse("Conversation introuvable", 404, req);
  }

  const prepared = await prepare(body, conversation);
  if (!prepared.ok) return errorResponse(prepared.error, prepared.status, req);
  const { job } = prepared;
  const estimateUsd = estimateVideoCostUsd(job.durationSeconds);
  if (!acknowledgedCoversServerPrice(acknowledged, estimateUsd)) {
    return cors(
      NextResponse.json({ error: "Le prix a changé.", code: "price_changed", estimateUsd }, { status: 409 }),
      req,
    );
  }

  const { data: id, error: reserveError } = await supabaseAdmin.rpc("reserve_studio_spend", {
    p_user_id: staff.id,
    p_kind: "video",
    p_voice: null,
    p_model: "heygen-hyperframes",
    p_input: { mode: job.mode, seconds: job.durationSeconds, title: job.title },
    p_est_cost_usd: estimateUsd,
    p_cap_usd: await getVideoCapUsd(staff.id),
    p_month_start: startOfMonthIso(),
  });
  if (reserveError) {
    console.error("Studio: video reserve failed", reserveError.code, reserveError.message);
    return errorResponse("Erreur du Studio", 500, req);
  }
  if (!id) return errorResponse("Budget vidéo du mois atteint. Demandez à Salif de le relever.", 402, req);

  await supabaseAdmin
    .from("studio_generations")
    .update({ conversation_id: conversation.id, property_id: conversation.property_id })
    .eq("id", id);

  const submitted = await submitRender(job.html, job.title, String(id));
  if (!submitted.ok) {
    console.error("Studio: HeyGen submit failed", submitted.status, submitted.message);
    await supabaseAdmin.from("studio_generations").update({ status: "failed", error: `heygen ${submitted.status}` }).eq("id", id);
    return errorResponse(
      submitted.status === 402 || submitted.status === 403
        ? "Le compte HeyGen n'a plus de crédit ou la clé est refusée. Prévenez Salif."
        : "Le rendu n'a pas pu démarrer. Réessayez.",
      502,
      req,
    );
  }

  await supabaseAdmin
    .from("studio_generations")
    .update({
      provider_request_id: submitted.renderId,
      input: { mode: job.mode, seconds: job.durationSeconds, title: job.title, render_id: submitted.renderId },
    })
    .eq("id", id);

  return cors(NextResponse.json({ id, estimateUsd, seconds: job.durationSeconds }), req);
}

// Renders still running for a conversation, so the editor resumes after a reload.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const conversationId = new URL(req.url).searchParams.get("conversation_id");
  if (!conversationId) return errorResponse("Conversation manquante", 400, req);
  const { data } = await supabaseAdmin
    .from("studio_generations")
    .select("id, input, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", staff.id)
    .eq("kind", "video")
    .in("status", ["running", "finalizing"])
    .order("created_at", { ascending: false });
  return cors(
    NextResponse.json({
      running: (data ?? []).map((r) => ({ id: r.id, mode: (r.input as { mode?: string } | null)?.mode ?? "full", createdAt: r.created_at })),
    }),
    req,
  );
}
