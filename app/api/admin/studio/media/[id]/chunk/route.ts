import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadFieldMedia } from "@/lib/studio/field-media";
import { PROXY_CHUNK_BYTES } from "@/lib/studio/field-media-rules";
import { DriveError, relayChunk } from "@/lib/studio/google-drive";

export const maxDuration = 60;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

const RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/;

// Fallback only: when the browser cannot reach Google directly (CORS refused,
// network filter), it sends 4 MiB chunks here and the server relays them to
// the same Drive session. Slower, but never above Vercel's body limit.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadFieldMedia(id);
  if (!row) return errorResponse("Fichier introuvable.", 404, req);
  if (row.status !== "uploading" || !row.upload_session_url) return errorResponse("Cet envoi est terminé.", 409, req);

  const match = RANGE.exec(req.headers.get("x-content-range") ?? "");
  const size = Number(row.size_bytes);
  if (!match || Number(match[3]) !== size) return errorResponse("Plage d'octets invalide.", 400, req);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start || end >= size || end - start + 1 > PROXY_CHUNK_BYTES) {
    return errorResponse("Morceau trop grand ou hors du fichier.", 400, req);
  }

  const bytes = await req.arrayBuffer();
  if (bytes.byteLength !== end - start + 1) return errorResponse("Morceau incomplet.", 400, req);

  try {
    const session = await relayChunk(row.upload_session_url, `bytes ${start}-${end}/${size}`, bytes);
    if (session.state === "expired") return errorResponse("La session d'envoi a expiré. Relancez l'envoi.", 410, req);
    return cors(
      NextResponse.json(
        session.state === "complete"
          ? { complete: true, offset: size, driveFileId: session.file.id || null }
          : { complete: false, offset: session.offset },
      ),
      req,
    );
  } catch (error) {
    if (error instanceof DriveError) return errorResponse(error.message, error.status, req);
    console.error("Studio: field media relay failed", error instanceof Error ? error.message : error);
    return errorResponse("Erreur du Studio", 500, req);
  }
}
