import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { copyFactsFor, loadFinalVideo, renameForSend, videoTitle } from "@/lib/studio/final-videos-server";
import {
  destinationOptions,
  finalizeNetworkCopy,
  networkCopyErrors,
  parseNetworkCopy,
  sameTextEverywhere,
  ticksToNetworks,
  type NetworkCopy,
} from "@/lib/studio/publish-everywhere";
import {
  PUBLICATION_COLUMNS,
  metaStatus,
  roleOf,
  tiktokPublishStatus,
  toDtos,
  youtubePublishStatus,
  type PublicationRow,
} from "@/lib/studio/publishing-server";

export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * « Envoyer à Salif » (PRD 2.5): creates the post « À valider » with the
 * video, the ticked networks, the base and per-network texts (finalized by
 * code again here), and when to publish: « Dès que Salif valide » or a date.
 * The founder's « Valider la vidéo » task on Accueil comes from this row
 * (lib/team-tasks/sources.ts). A post Salif sent back is sent again here.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const video = await loadFinalVideo(id);
  if (!video) return errorResponse("Vidéo introuvable.", 404, req);
  const role = roleOf(staff);
  if (video.uploaded_by !== staff.id && role !== "founder") return errorResponse("Seule la personne qui a envoyé la vidéo peut la proposer.", 403, req);
  if (video.status !== "ready") return errorResponse("La vidéo n'est pas encore confirmée dans le Drive.", 409, req);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorResponse("Requête invalide", 400, req);

  const meta = metaStatus();
  const options = destinationOptions({ facebook: meta.facebook, instagram: meta.instagram, tiktok: await tiktokPublishStatus(), youtube: await youtubePublishStatus() });
  const networks = ticksToNetworks(Array.isArray(body.networks) ? body.networks.map(String) : [], options);
  if (!networks.length) return errorResponse("Choisissez au moins un réseau disponible.", 400, req);

  const propertyId = typeof body.propertyId === "string" && UUID.test(body.propertyId) ? body.propertyId : null;
  if (propertyId) {
    const { data } = await supabaseAdmin.from("properties").select("id").eq("id", propertyId).maybeSingle();
    if (!data) return errorResponse("Bien introuvable.", 404, req);
  }
  const facts = await copyFactsFor(propertyId);
  const sameText = Boolean(body.sameText);
  const rawBase = (body.base ?? {}) as { text?: unknown; hashtags?: unknown };
  const base = finalizeNetworkCopy(
    "base",
    { text: typeof rawBase.text === "string" ? rawBase.text : "", hashtags: Array.isArray(rawBase.hashtags) ? rawBase.hashtags.map(String) : [] },
    facts,
  );
  let networkCopy: NetworkCopy;
  if (sameText) {
    networkCopy = sameTextEverywhere({ text: base.text, hashtags: base.hashtags }, networks, facts);
  } else {
    const parsed = parseNetworkCopy(body.networkCopy);
    networkCopy = {};
    for (const n of networks) {
      const final = finalizeNetworkCopy(n, parsed[n] ?? { text: base.text, hashtags: base.hashtags }, facts);
      networkCopy[n] = { text: final.text, hashtags: final.hashtags };
    }
  }
  const errors = networkCopyErrors(networks, networkCopy, { text: base.text, hashtags: base.hashtags }, facts, sameText);
  if (!base.text.trim() || errors.length) {
    const problems = errors.length ? errors.map((e) => ({ code: `copy-${e.network}`, message: e.message })) : [{ code: "empty", message: "Préparez ou écrivez le texte d'abord." }];
    return cors(NextResponse.json({ error: problems[0].message, problems }, { status: 422 }), req);
  }

  // When: right after Salif's « Valider » (default), or a chosen date and time.
  const now = new Date();
  const publishOnApproval = body.when === undefined || body.when === "approval";
  let scheduledAt = now.toISOString();
  if (!publishOnApproval) {
    const d = new Date(String(body.when));
    if (Number.isNaN(d.getTime())) return errorResponse("Date de publication invalide.", 400, req);
    if (d.getTime() < now.getTime() + 5 * 60_000) return errorResponse("Choisissez une heure dans le futur, ou « Dès que Salif valide ».", 400, req);
    scheduledAt = d.toISOString();
  }

  const title = await videoTitle(body.title, propertyId, video.file_name);
  const values = {
    title,
    property_id: propertyId,
    media_type: "video",
    final_video_id: video.id,
    networks,
    caption: base.text,
    hashtags: base.hashtags.slice(0, 5),
    network_copy: networkCopy,
    same_text: sameText,
    publish_on_approval: publishOnApproval,
    scheduled_at: scheduledAt,
    notes: typeof body.note === "string" ? body.note.slice(0, 1000) : "",
    status: "a_valider",
    approved_by: null,
    approved_at: null,
    submitted_by: staff.id,
    submitted_at: now.toISOString(),
    returned_at: null,
    caption_edited_by: staff.id,
    caption_edited_at: now.toISOString(),
    caption_model: typeof body.model === "string" ? body.model.slice(0, 60) : null,
    updated_at: now.toISOString(),
  };

  const { data: existing } = await supabaseAdmin
    .from("studio_publications")
    .select("id, status, claimed_at")
    .eq("final_video_id", video.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const current = existing?.[0] as { id: string; status: string; claimed_at: string | null } | undefined;
  let saved: PublicationRow | null = null;
  if (current) {
    if (current.status !== "a_faire" || current.claimed_at) return errorResponse("Cette vidéo est déjà chez Salif ou publiée.", 409, req);
    const { data, error } = await supabaseAdmin
      .from("studio_publications")
      .update(values)
      .eq("id", current.id)
      .eq("status", "a_faire")
      .is("claimed_at", null)
      .select(PUBLICATION_COLUMNS);
    if (error) {
      console.error("Studio final videos: resend failed", error.code);
      return errorResponse("Envoi impossible", 500, req);
    }
    saved = (data?.[0] as PublicationRow | undefined) ?? null;
    if (!saved) return errorResponse("La publication a changé entre-temps. Rechargez la page.", 409, req);
  } else {
    const { data, error } = await supabaseAdmin
      .from("studio_publications")
      .insert({ ...values, assignee_id: staff.id, created_by: staff.id })
      .select(PUBLICATION_COLUMNS)
      .single();
    if (error || !data) {
      console.error("Studio final videos: send failed", error?.code);
      return errorResponse("Envoi impossible", 500, req);
    }
    saved = data as PublicationRow;
  }

  // The Drive copy takes its final French name (title or listing may have changed).
  if (video.property_id !== propertyId) {
    await supabaseAdmin.from("studio_final_videos").update({ property_id: propertyId }).eq("id", video.id);
  }
  await renameForSend(video, title);
  const [post] = await toDtos([saved]);
  return cors(NextResponse.json({ post }), req);
}
