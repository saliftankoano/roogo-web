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
import { signedFieldMediaUrl } from "@/lib/studio/field-media";
import {
  MAX_PRESENTER_SECONDS,
  MIN_CLIP_SECONDS,
  buildOutroOnly,
  buildPresenterCorner,
  buildVisitePov,
  clampMusicLevel,
  clampVoiceDelay,
  clampVoiceLevel,
  defaultOutro,
  estimateVideoCostUsd,
  isVideoTemplateId,
  type OutroText,
  type VideoTemplateId,
} from "@/lib/studio/video-templates";

export const maxDuration = 30;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Price and currency are not here on purpose: they always come from the listing,
// whatever the browser sends (Salif, 2026-10-10).
const OUTRO_FIELDS: (keyof OutroText)[] = [
  "headline",
  "location",
  "note",
  "contactLabel",
  "phone",
  "phone2",
  "footer",
];

type Prepared = {
  html: string;
  durationSeconds: number;
  title: string;
  mode: "full" | "outro";
  template: VideoTemplateId;
};

// HeyGen reads the clips once, early; three hours leaves room for its queue.
const CLIP_URL_SECONDS = 3 * 3600;

type ClipRow = { id: string; property_id: string | null; kind: string; status: string; duration_seconds: number | null };

/**
 * The two filmed clips of a Présentateur video: both must be ready videos of
 * this project's property. Returns their signed URLs and lengths.
 */
async function loadPresenterClips(
  body: Record<string, unknown>,
  propertyId: string,
): Promise<
  | { ok: true; walkthrough: { url: string; seconds: number }; presenter: { url: string; seconds: number } }
  | { ok: false; status: number; error: string }
> {
  const walkId = typeof body.walkthroughMediaId === "string" ? body.walkthroughMediaId : "";
  const presenterId = typeof body.presenterMediaId === "string" ? body.presenterMediaId : "";
  if (!walkId || !presenterId) {
    return { ok: false, status: 400, error: "Choisissez la vidéo de visite et la vidéo du présentateur." };
  }
  if (walkId === presenterId) return { ok: false, status: 400, error: "Choisissez deux vidéos différentes." };

  const { data, error } = await supabaseAdmin
    .from("studio_field_media")
    .select("id, property_id, kind, status, duration_seconds")
    .in("id", [walkId, presenterId]);
  if (error) {
    console.error("Studio: field media lookup failed", error.code, error.message);
    return { ok: false, status: 503, error: "Les vidéos du terrain ne sont pas encore disponibles." };
  }
  const rows = (data ?? []) as ClipRow[];
  const check = (id: string, what: string): { ok: true; seconds: number } | { ok: false; status: number; error: string } => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.property_id !== propertyId) return { ok: false, status: 400, error: `${what} n'appartient pas à ce bien.` };
    if (row.kind !== "video") return { ok: false, status: 400, error: `${what} doit être une vidéo.` };
    if (row.status !== "ready") return { ok: false, status: 400, error: `${what} n'est pas encore prête.` };
    const seconds = Number(row.duration_seconds);
    if (!Number.isFinite(seconds) || seconds < MIN_CLIP_SECONDS) {
      return { ok: false, status: 400, error: `${what} est trop courte ou sa durée est inconnue.` };
    }
    return { ok: true, seconds };
  };
  const walk = check(walkId, "La vidéo de visite");
  if (!walk.ok) return walk;
  const presenter = check(presenterId, "La vidéo du présentateur");
  if (!presenter.ok) return presenter;
  if (presenter.seconds > MAX_PRESENTER_SECONDS) {
    return { ok: false, status: 400, error: `La vidéo du présentateur dépasse ${MAX_PRESENTER_SECONDS / 60} minutes. Coupez-la avant.` };
  }

  try {
    const [walkUrl, presenterUrl] = await Promise.all([
      signedFieldMediaUrl(walkId, CLIP_URL_SECONDS),
      signedFieldMediaUrl(presenterId, CLIP_URL_SECONDS),
    ]);
    return {
      ok: true,
      walkthrough: { url: walkUrl, seconds: walk.seconds },
      presenter: { url: presenterUrl, seconds: presenter.seconds },
    };
  } catch (err) {
    console.error("Studio: field media URL failed", err instanceof Error ? err.message : "unknown");
    return { ok: false, status: 503, error: "Les vidéos du terrain ne sont pas accessibles. Prévenez Salif." };
  }
}

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

  // Optional music from the team library, signed long enough for HeyGen's queue.
  let musicUrl: string | null = null;
  if (typeof body.music_track_id === "string" && body.music_track_id) {
    const { data: track } = await supabaseAdmin
      .from("studio_music_tracks")
      .select("storage_path")
      .eq("id", body.music_track_id)
      .eq("archived", false)
      .maybeSingle();
    if (!track) return { ok: false, status: 400, error: "Cette musique n'existe plus. Choisissez-en une autre." };
    const { data: signedMusic } = await supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUrl(track.storage_path, 3 * 3600);
    if (!signedMusic?.signedUrl) return { ok: false, status: 500, error: "La musique n'est pas accessible." };
    musicUrl = signedMusic.signedUrl;
  }

  // Levels set in the editor (Salif, 2026-10-11). Missing means the template's default.
  const musicLevel = typeof body.music_level === "number" ? clampMusicLevel(body.music_level) : undefined;
  const voiceLevel = typeof body.voice_level === "number" ? clampVoiceLevel(body.voice_level) : undefined;

  const mode = body.mode === "outro" ? "outro" : "full";
  // Missing means Visite POV, so older editors keep working (2026-10-12).
  if (body.templateId !== undefined && !isVideoTemplateId(body.templateId)) {
    return { ok: false, status: 400, error: "Modèle de vidéo inconnu." };
  }
  const template: VideoTemplateId = isVideoTemplateId(body.templateId) ? body.templateId : "visite-pov";
  const shortTitle = property.title.split(",").slice(0, 2).join(",");
  if (mode === "outro") {
    const built = buildOutroOnly({ outro, logoUrl: LOGO_URL, musicUrl, musicLevel });
    return { ok: true, job: { ...built, mode, template, title: `Fin seule · ${shortTitle}` } };
  }

  if (template === "presentateur-coin") {
    const clips = await loadPresenterClips(body, conversation.property_id);
    if (!clips.ok) return clips;
    const built = buildPresenterCorner({
      walkthroughUrl: clips.walkthrough.url,
      walkthroughSeconds: clips.walkthrough.seconds,
      presenterUrl: clips.presenter.url,
      presenterSeconds: clips.presenter.seconds,
      voiceLevel,
      musicUrl,
      musicLevel,
      logoUrl: LOGO_URL,
      outro,
    });
    return {
      ok: true,
      job: { html: built.html, durationSeconds: built.durationSeconds, mode, template, title: `Présentateur · ${shortTitle}` },
    };
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
  // The voice-over is optional (Salif, 2026-10-11): without it, the music carries the video.
  const voice = body.use_voice === false ? undefined : (artifacts ?? []).find((a) => a.kind === "voiceover" && a.output_path);
  if (!voice && !musicUrl) return { ok: false, status: 400, error: "Ajoutez une voix off ou une musique." };
  const scripts = (artifacts ?? []).filter((a) => a.kind === "script");
  const script = scripts.find((a) => a.pinned) ?? scripts[0];
  let voiceUrl = "";
  let voiceSeconds = 0;
  if (voice) {
    voiceSeconds = Number((voice.meta as { duration_seconds?: number } | null)?.duration_seconds);
    if (!Number.isFinite(voiceSeconds) || voiceSeconds <= 0) {
      return { ok: false, status: 400, error: "La durée de la voix off est inconnue. Régénérez-la." };
    }
    // The render reads the audio once, early; three hours leaves room for HeyGen's queue.
    const { data: signed } = await supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUrl(voice.output_path!, 3 * 3600);
    if (!signed?.signedUrl) return { ok: false, status: 500, error: "La voix off n'est pas accessible." };
    voiceUrl = signed.signedUrl;
  }

  const built = buildVisitePov({
    photos,
    voiceUrl,
    voiceSeconds,
    voiceDelay: clampVoiceDelay(Number(body.voice_delay)),
    voiceLevel,
    musicLevel,
    script: script?.text ?? undefined,
    logoUrl: LOGO_URL,
    musicUrl,
    outro,
  });
  return { ok: true, job: { html: built.html, durationSeconds: built.durationSeconds, mode, template, title: `Visite POV · ${shortTitle}` } };
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
    p_input: { mode: job.mode, template: job.template, seconds: job.durationSeconds, title: job.title },
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
      input: { mode: job.mode, template: job.template, seconds: job.durationSeconds, title: job.title, render_id: submitted.renderId },
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
