import { corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadFinalVideo } from "@/lib/studio/final-videos-server";
import { relayChunkRequest } from "@/lib/studio/drive-relay";

export const maxDuration = 60;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Fallback relay of one 4 MiB chunk to the video's Drive session.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadFinalVideo(id);
  if (!row) return errorResponse("Vidéo introuvable.", 404, req);
  if (row.uploaded_by !== staff.id) return errorResponse("Seule la personne qui envoie la vidéo peut la continuer.", 403, req);
  return relayChunkRequest(req, { status: row.status, sessionUrl: row.upload_session_url, sizeBytes: Number(row.size_bytes) }, "final video");
}
