import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { finalizeFieldMedia, loadFieldMedia, toFieldMediaDto } from "@/lib/studio/field-media";
import { DriveError } from "@/lib/studio/google-drive";

export const maxDuration = 30;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The browser says it sent the last byte. The server asks Drive itself and
// marks the file ready only if Drive has it, in the right folder, at the right size.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadFieldMedia(id);
  if (!row) return errorResponse("Fichier introuvable.", 404, req);

  const body = (await req.json().catch(() => ({}))) as { driveFileId?: unknown; durationSeconds?: unknown };
  try {
    const result = await finalizeFieldMedia(row, {
      driveFileId: typeof body.driveFileId === "string" ? body.driveFileId : null,
      durationSeconds: typeof body.durationSeconds === "number" ? body.durationSeconds : null,
    });
    if (result.state === "incomplete") {
      return cors(
        NextResponse.json(
          { error: "Envoi incomplet.", media: toFieldMediaDto(result.row), offset: result.offset },
          { status: 409 },
        ),
        req,
      );
    }
    return cors(NextResponse.json({ media: toFieldMediaDto(result.row) }, { status: result.state === "ready" ? 200 : 422 }), req);
  } catch (error) {
    if (error instanceof DriveError) return errorResponse(error.message, error.status, req);
    console.error("Studio: field media finalize failed", error instanceof Error ? error.message : error);
    return errorResponse("Erreur du Studio", 500, req);
  }
}
