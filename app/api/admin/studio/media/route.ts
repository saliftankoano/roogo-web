import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  FIELD_MEDIA_COLUMNS,
  backfillVideoDurations,
  finalizeFieldMedia,
  markFieldMediaFailed,
  toFieldMediaDto,
  uploadOrigin,
  visitFolderFor,
  type FieldMediaRow,
} from "@/lib/studio/field-media";
import { DIRECT_CHUNK_BYTES, PROXY_CHUNK_BYTES, checkUploadRequest, driveFolderUrl } from "@/lib/studio/field-media-rules";
import { DriveError, createResumableSession, ensureVisitFolder, isDriveConfigured, querySession } from "@/lib/studio/google-drive";

export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Google keeps a resumable session about a week; we resume for 6 days. */
const RESUME_WINDOW_MS = 6 * 24 * 3600 * 1000;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The visit's photos and videos for one property, newest first.
// SHARED CONTRACT: { media: [{ id, kind, fileName, mimeType, sizeBytes,
// durationSeconds, status, driveFileId, createdAt, ...extras }] }
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const propertyId = new URL(req.url).searchParams.get("propertyId") ?? "";
  if (!UUID.test(propertyId)) return errorResponse("propertyId manquant", 400, req);

  const { data, error } = await supabaseAdmin
    .from("studio_field_media")
    .select(FIELD_MEDIA_COLUMNS)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("Studio: field media list failed", error.code);
    return errorResponse("Erreur du Studio", 500, req);
  }
  let rows = (data ?? []) as FieldMediaRow[];
  if (isDriveConfigured()) rows = await backfillVideoDurations(rows).catch(() => rows);
  const folderId = rows.find((r) => r.status === "ready")?.drive_folder_id ?? rows[0]?.drive_folder_id ?? null;
  return cors(
    NextResponse.json({
      media: rows.map(toFieldMediaDto),
      folderUrl: folderId ? driveFolderUrl(folderId) : null,
      driveConfigured: isDriveConfigured(),
    }),
    req,
  );
}

// Starts (or resumes) one file's upload. The server opens a resumable session
// in the visit's Drive folder; the browser sends the bytes straight to Google.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  if (!isDriveConfigured()) {
    return errorResponse("Google Drive n'est pas encore branché au Studio. Demandez à Salif de terminer la configuration.", 503, req);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  if (!UUID.test(propertyId)) return errorResponse("Bien manquant.", 400, req);
  const input = checkUploadRequest(body ?? {});
  if (!input.ok) return errorResponse(input.reason, 400, req);

  try {
    // Same person, same property, same file name and size, unfinished: resume it.
    const { data: previous } = await supabaseAdmin
      .from("studio_field_media")
      .select(FIELD_MEDIA_COLUMNS)
      .eq("property_id", propertyId)
      .eq("uploaded_by", staff.id)
      .eq("file_name", input.fileName)
      .eq("size_bytes", input.sizeBytes)
      .eq("status", "uploading")
      .gte("created_at", new Date(Date.now() - RESUME_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const old = (previous?.[0] as FieldMediaRow | undefined) ?? null;
    if (old?.upload_session_url) {
      const session = await querySession(old.upload_session_url, input.sizeBytes);
      if (session.state === "incomplete") {
        return cors(
          NextResponse.json({
            media: toFieldMediaDto(old),
            uploadUrl: old.upload_session_url,
            offset: session.offset,
            resumed: true,
            directChunkBytes: DIRECT_CHUNK_BYTES,
            proxyChunkBytes: PROXY_CHUNK_BYTES,
          }),
          req,
        );
      }
      if (session.state === "complete") {
        const done = await finalizeFieldMedia(old);
        if (done.state === "ready") {
          return cors(NextResponse.json({ media: toFieldMediaDto(done.row), done: true }), req);
        }
      } else {
        await markFieldMediaFailed(old.id, "La session d'envoi a expiré.");
      }
    }

    const folder = await visitFolderFor(propertyId);
    if (!folder) return errorResponse("Bien introuvable.", 404, req);
    const folderId = await ensureVisitFolder(folder.top, folder.name);
    const uploadUrl = await createResumableSession({
      name: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      folderId,
      origin: uploadOrigin(req),
    });

    const { data: row, error } = await supabaseAdmin
      .from("studio_field_media")
      .insert({
        property_id: propertyId,
        kind: input.kind,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        duration_seconds: input.durationSeconds,
        drive_folder_id: folderId,
        drive_folder_path: folder.path,
        upload_session_url: uploadUrl,
        status: "uploading",
        uploaded_by: staff.id,
      })
      .select(FIELD_MEDIA_COLUMNS)
      .single();
    if (error || !row) {
      console.error("Studio: field media insert failed", error?.code);
      return errorResponse("Erreur du Studio", 500, req);
    }

    return cors(
      NextResponse.json({
        media: toFieldMediaDto(row as FieldMediaRow),
        uploadUrl,
        offset: 0,
        resumed: false,
        directChunkBytes: DIRECT_CHUNK_BYTES,
        proxyChunkBytes: PROXY_CHUNK_BYTES,
      }),
      req,
    );
  } catch (error) {
    if (error instanceof DriveError) return errorResponse(error.message, error.status, req);
    console.error("Studio: field media start failed", error instanceof Error ? error.message : error);
    return errorResponse("Erreur du Studio", 500, req);
  }
}
