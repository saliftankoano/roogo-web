// The relay half of a resumable Drive upload (server only), shared by field
// media and final videos. Fallback only: when the browser cannot reach Google
// directly (CORS refused, network filter), it sends 4 MiB chunks to our route
// and the server forwards them to the same Drive session. Slower, but never
// above Vercel's body limit.

import { NextResponse } from "next/server";
import { cors, errorResponse } from "@/lib/api-helpers";
import { PROXY_CHUNK_BYTES } from "./field-media-rules";
import { DriveError, relayChunk } from "./google-drive";

const RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/;

export async function relayChunkRequest(
  req: Request,
  upload: { status: string; sessionUrl: string | null; sizeBytes: number },
  label: string,
): Promise<Response> {
  if (upload.status !== "uploading" || !upload.sessionUrl) return errorResponse("Cet envoi est terminé.", 409, req);
  const match = RANGE.exec(req.headers.get("x-content-range") ?? "");
  const size = upload.sizeBytes;
  if (!match || Number(match[3]) !== size) return errorResponse("Plage d'octets invalide.", 400, req);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start || end >= size || end - start + 1 > PROXY_CHUNK_BYTES) {
    return errorResponse("Morceau trop grand ou hors du fichier.", 400, req);
  }
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength !== end - start + 1) return errorResponse("Morceau incomplet.", 400, req);
  try {
    const session = await relayChunk(upload.sessionUrl, `bytes ${start}-${end}/${size}`, bytes);
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
    console.error(`Studio: ${label} relay failed`, error instanceof Error ? error.message : error);
    return errorResponse("Erreur du Studio", 500, req);
  }
}
