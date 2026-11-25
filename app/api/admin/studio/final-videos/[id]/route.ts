import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadFinalVideo, markFinalVideoFailed, removeFinalVideo, toFinalVideoDto } from "@/lib/studio/final-videos-server";
import { roleOf } from "@/lib/studio/publishing-server";
import { DriveError, querySession } from "@/lib/studio/google-drive";

export const maxDuration = 30;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// One video, with how many bytes Google already has while it is uploading.
// The browser asks this after a network error to continue where it stopped.
// Same answer shape as /api/admin/studio/media/[id] (one uploader for both).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadFinalVideo(id);
  if (!row) return errorResponse("Vidéo introuvable.", 404, req);
  if (row.status !== "uploading" || !row.upload_session_url) {
    return cors(NextResponse.json({ media: toFinalVideoDto(row), offset: null, complete: row.status === "ready" }), req);
  }
  try {
    const session = await querySession(row.upload_session_url, Number(row.size_bytes));
    if (session.state === "expired") {
      const failed = await markFinalVideoFailed(row.id, "La session d'envoi a expiré. Relancez l'envoi.");
      return cors(NextResponse.json({ media: toFinalVideoDto(failed), offset: null, complete: false }), req);
    }
    return cors(
      NextResponse.json({
        media: toFinalVideoDto(row),
        offset: session.state === "incomplete" ? session.offset : Number(row.size_bytes),
        complete: session.state === "complete",
      }),
      req,
    );
  } catch (error) {
    if (error instanceof DriveError) return errorResponse(error.message, error.status, req);
    console.error("Studio: final video progress failed", error instanceof Error ? error.message : error);
    return errorResponse("Erreur du Studio", 500, req);
  }
}

// « Retirer » / « Changer de vidéo »: removes an upload that was never sent to
// Salif. Only the person who uploaded it, or the founder.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadFinalVideo(id);
  if (!row) return cors(NextResponse.json({ removed: true }), req);
  if (row.uploaded_by !== staff.id && roleOf(staff) !== "founder") {
    return errorResponse("Seule la personne qui a envoyé la vidéo peut la retirer.", 403, req);
  }
  try {
    const result = await removeFinalVideo(row);
    if (!result.ok) return errorResponse(result.error, result.status, req);
    return cors(NextResponse.json({ removed: true }), req);
  } catch (error) {
    if (error instanceof DriveError) return errorResponse(error.message, error.status, req);
    console.error("Studio: final video removal failed", error instanceof Error ? error.message : error);
    return errorResponse("Erreur du Studio", 500, req);
  }
}
