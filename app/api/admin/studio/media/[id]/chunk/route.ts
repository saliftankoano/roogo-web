import { corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadFieldMedia } from "@/lib/studio/field-media";
import { relayChunkRequest } from "@/lib/studio/drive-relay";

export const maxDuration = 60;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Fallback only: when the browser cannot reach Google directly (CORS refused,
// network filter), it sends 4 MiB chunks here and the server relays them to
// the same Drive session (lib/studio/drive-relay.ts).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadFieldMedia(id);
  if (!row) return errorResponse("Fichier introuvable.", 404, req);
  return relayChunkRequest(req, { status: row.status, sessionUrl: row.upload_session_url, sizeBytes: Number(row.size_bytes) }, "field media");
}
