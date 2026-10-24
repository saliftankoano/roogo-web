import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { finalizeFinalVideo, loadFinalVideo, toFinalVideoDto } from "@/lib/studio/final-videos-server";
import { DriveError } from "@/lib/studio/google-drive";

export const maxDuration = 30;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The browser says it sent the last byte. The server asks Drive itself and
// marks the video ready only if Drive has it in « Vidéos finales » at the
// right size (and, when Drive measured it, vertical and at most 3 minutes).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadFinalVideo(id);
  if (!row) return errorResponse("Vidéo introuvable.", 404, req);
  const body = (await req.json().catch(() => ({}))) as { driveFileId?: unknown };
  try {
    const result = await finalizeFinalVideo(row, { driveFileId: typeof body.driveFileId === "string" ? body.driveFileId : null });
    if (result.state === "incomplete") {
      return cors(NextResponse.json({ error: "Envoi incomplet.", media: toFinalVideoDto(result.row), offset: result.offset }, { status: 409 }), req);
    }
    return cors(NextResponse.json({ media: toFinalVideoDto(result.row) }, { status: result.state === "ready" ? 200 : 422 }), req);
  } catch (error) {
    if (error instanceof DriveError) return errorResponse(error.message, error.status, req);
    console.error("Studio: final video finalize failed", error instanceof Error ? error.message : error);
    return errorResponse("Erreur du Studio", 500, req);
  }
}
