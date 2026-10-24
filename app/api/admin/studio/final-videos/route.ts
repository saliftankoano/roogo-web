import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { uploadOrigin } from "@/lib/studio/field-media";
import { DIRECT_CHUNK_BYTES, PROXY_CHUNK_BYTES } from "@/lib/studio/field-media-rules";
import { DriveError, isDriveConfigured } from "@/lib/studio/google-drive";
import { destinationOptions } from "@/lib/studio/publish-everywhere";
import {
  FINAL_VIDEO_COLUMNS,
  startFinalVideoUpload,
  toFinalVideoDto,
  type FinalVideoRow,
} from "@/lib/studio/final-videos-server";
import {
  PUBLICATION_COLUMNS,
  metaStatus,
  publishSlots,
  roleOf,
  tiktokPublishStatus,
  toDtos,
  youtubePublishStatus,
  type PublicationRow,
} from "@/lib/studio/publishing-server";

export const maxDuration = 30;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// « Publier une vidéo »: the destinations (ticked by default when they can
// publish), and « Mes vidéos » with each one's post and per-network results.
// Staff see their own uploads; the founder sees everyone's.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const role = roleOf(staff);
  const meta = metaStatus();
  const [tiktok, youtube] = await Promise.all([tiktokPublishStatus(), youtubePublishStatus()]);
  const destinations = destinationOptions({ facebook: meta.facebook, instagram: meta.instagram, tiktok, youtube });

  let query = supabaseAdmin.from("studio_final_videos").select(FINAL_VIDEO_COLUMNS).order("created_at", { ascending: false }).limit(30);
  if (role !== "founder") query = query.eq("uploaded_by", staff.id);
  const { data: videoRows, error } = await query;
  if (error) {
    console.error("Studio final videos: list failed", error.code);
    return errorResponse(error.code === "42P01" ? "Migration 105 à lancer : « Publier une vidéo » n'est pas encore installé." : "Liste indisponible", 500, req);
  }
  const videos = (videoRows ?? []) as FinalVideoRow[];
  const ids = videos.map((v) => v.id);
  const { data: postRows } = ids.length
    ? await supabaseAdmin.from("studio_publications").select(PUBLICATION_COLUMNS).in("final_video_id", ids).order("created_at", { ascending: false })
    : { data: [] };
  const posts = await toDtos((postRows ?? []) as PublicationRow[]);
  const byVideo = new Map<string, (typeof posts)[number]>();
  for (const p of posts) if (p.finalVideo && !byVideo.has(p.finalVideo.id)) byVideo.set(p.finalVideo.id, p);

  return cors(
    NextResponse.json({
      me: { id: staff.id, role },
      destinations,
      tiktok,
      youtube,
      driveConfigured: isDriveConfigured(),
      slots: publishSlots(),
      items: videos.map((v) => ({ video: toFinalVideoDto(v), post: byVideo.get(v.id) ?? null })),
    }),
    req,
  );
}

// Starts (or resumes) one video's upload to Drive « Vidéos finales ». The
// browser then sends the bytes straight to Google (or through the relay).
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  if (!isDriveConfigured()) {
    return errorResponse("Google Drive n'est pas encore branché au Studio. Demandez à Salif de terminer la configuration.", 503, req);
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorResponse("Requête invalide", 400, req);
  try {
    const result = await startFinalVideoUpload(staff.id, body, uploadOrigin(req));
    if (!result.ok) return errorResponse(result.error, result.status, req);
    return cors(
      NextResponse.json({
        media: toFinalVideoDto(result.video),
        uploadUrl: result.uploadUrl,
        offset: result.offset ?? 0,
        done: result.done ?? false,
        resumed: result.resumed ?? false,
        directChunkBytes: DIRECT_CHUNK_BYTES,
        proxyChunkBytes: PROXY_CHUNK_BYTES,
      }),
      req,
    );
  } catch (error) {
    if (error instanceof DriveError) return errorResponse(error.message, error.status, req);
    console.error("Studio: final video start failed", error instanceof Error ? error.message : error);
    return errorResponse("Erreur du Studio", 500, req);
  }
}
