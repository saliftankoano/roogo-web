// Field media: the visit's photos and videos, stored in the shared Google
// Drive "Roogo" and indexed in studio_field_media. Server only.
//
// SHARED CONTRACT (other Studio features rely on these names):
//   table  studio_field_media
//   route  GET /api/admin/studio/media?propertyId=  ->  { media: FieldMediaDto[] }
//   helper signedFieldMediaUrl(mediaId, ttlSeconds?) -> absolute stream URL

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDriveFile, querySession } from "./google-drive";
import { signMediaToken, streamTtl } from "./field-media-token";
import {
  checkFinalizedFile,
  driveFileUrl,
  driveTopFolder,
  propertyFolderName,
  type FieldMediaKind,
  type FieldMediaStatus,
} from "./field-media-rules";

export const FIELD_MEDIA_COLUMNS =
  "id, property_id, kind, file_name, mime_type, size_bytes, duration_seconds, drive_file_id, drive_folder_id, drive_folder_path, upload_session_url, status, error, uploaded_by, created_at";

export type FieldMediaRow = {
  id: string;
  property_id: string;
  kind: FieldMediaKind;
  file_name: string;
  mime_type: string;
  size_bytes: number | string;
  duration_seconds: number | string | null;
  drive_file_id: string | null;
  drive_folder_id: string;
  drive_folder_path: string | null;
  upload_session_url: string | null;
  status: FieldMediaStatus;
  error: string | null;
  uploaded_by: string | null;
  created_at: string;
};

/** What the list route returns. The first nine fields are the shared contract. */
export type FieldMediaDto = {
  id: string;
  kind: FieldMediaKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  status: FieldMediaStatus;
  driveFileId: string | null;
  createdAt: string;
  // Extras for the Studio panel.
  driveUrl: string | null;
  folderPath: string | null;
  error: string | null;
};

export function toFieldMediaDto(row: FieldMediaRow): FieldMediaDto {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    status: row.status,
    driveFileId: row.drive_file_id,
    createdAt: row.created_at,
    driveUrl: row.drive_file_id ? driveFileUrl(row.drive_file_id) : null,
    folderPath: row.drive_folder_path,
    error: row.error,
  };
}

/**
 * The key that signs stream links. STUDIO_MEDIA_URL_SECRET when set; otherwise
 * a key derived from the Supabase service key, so links work without extra
 * setup. Setting the dedicated secret (or rotating it) revokes old links.
 */
export function mediaTokenSecret(): string {
  const dedicated = process.env.STUDIO_MEDIA_URL_SECRET?.trim();
  if (dedicated) return dedicated;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) throw new Error("No secret available to sign Studio media links");
  return signMediaToken(base, "derive-key", 0);
}

/** The public address of this app, where HeyGen can reach the stream route. */
export function publicBaseUrl(): string {
  const raw = process.env.STUDIO_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.roogobf.com";
  return raw.replace(/\/+$/, "");
}

export function streamPath(mediaId: string): string {
  return `/api/admin/studio/media/${encodeURIComponent(mediaId)}/stream`;
}

/**
 * An absolute, signed stream URL for one field media file, usable without a
 * browser session (HeyGen and other renderers). Valid 3 hours by default,
 * 24 hours at most. Range requests are supported. Throws when the file is
 * unknown or not ready yet.
 */
export async function signedFieldMediaUrl(mediaId: string, ttlSeconds?: number): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("studio_field_media")
    .select("id, status")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error(`studio_field_media lookup failed (${error.code})`);
  if (!data) throw new Error("Field media not found");
  if (data.status !== "ready") throw new Error(`Field media is not ready (${data.status})`);
  const exp = Math.floor(Date.now() / 1000) + streamTtl(ttlSeconds);
  const token = signMediaToken(mediaTokenSecret(), mediaId, exp);
  return `${publicBaseUrl()}${streamPath(mediaId)}?exp=${exp}&token=${token}`;
}

export type VisitFolder = { top: "Vente" | "Location"; name: string; path: string };

/**
 * The owner's name for staff screens and Drive folders: the seller recorded
 * at a direct sale intake, else the account that listed the property. Never
 * shown publicly.
 */
export async function propertyOwnerName(propertyId: string, agentId: string | null | undefined): Promise<string | null> {
  const { data: intake } = await supabaseAdmin
    .from("sale_intakes")
    .select("owner_first_name, owner_last_name")
    .eq("property_id", propertyId)
    .maybeSingle();
  const fromIntake = intake ? [intake.owner_first_name, intake.owner_last_name].filter(Boolean).join(" ") : "";
  if (fromIntake) return fromIntake;
  if (!agentId) return null;
  const { data: agent } = await supabaseAdmin.from("users").select("full_name").eq("id", agentId).maybeSingle();
  return agent?.full_name ?? null;
}

/**
 * Where a property's visit files go, by the field sheet rule. Owner name: the
 * seller recorded at a direct sale intake, else the account that listed the
 * property. Only used to name the Drive folder; never shown publicly.
 */
export async function visitFolderFor(propertyId: string): Promise<VisitFolder | null> {
  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("id, listing_type, quartier, agent_id, is_test")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) return null;

  const ownerName = await propertyOwnerName(propertyId, property.agent_id);
  const top = driveTopFolder(property.listing_type);
  const name = propertyFolderName(property.quartier, ownerName);
  return { top, name, path: `${top}/${name}` };
}

// ---------------------------------------------------------------------------
// Upload lifecycle (server side of /api/admin/studio/media).


export type FinalizeResult =
  | { state: "ready" | "failed"; row: FieldMediaRow }
  | { state: "incomplete"; row: FieldMediaRow; offset: number };

async function updateRow(id: string, patch: Partial<FieldMediaRow>): Promise<FieldMediaRow> {
  const { data, error } = await supabaseAdmin
    .from("studio_field_media")
    .update(patch)
    .eq("id", id)
    .select(FIELD_MEDIA_COLUMNS)
    .single();
  if (error || !data) throw new Error(`studio_field_media update failed (${error?.code ?? "no row"})`);
  return data as FieldMediaRow;
}

export function markFieldMediaFailed(id: string, reason: string): Promise<FieldMediaRow> {
  return updateRow(id, { status: "failed", error: reason.slice(0, 500), upload_session_url: null });
}

/**
 * Marks an upload ready only after Drive itself confirms it: the session is
 * complete, and the file exists in the chosen folder with the announced size.
 * Safe to call twice. `hint` comes from the browser and is only a fallback.
 */
export async function finalizeFieldMedia(
  row: FieldMediaRow,
  hint: { driveFileId?: string | null; durationSeconds?: number | null } = {},
): Promise<FinalizeResult> {
  if (row.status !== "uploading") return { state: row.status, row };
  if (!row.upload_session_url) {
    return { state: "failed", row: await markFieldMediaFailed(row.id, "Session d'envoi perdue. Relancez l'envoi.") };
  }

  const sizeBytes = Number(row.size_bytes);
  const session = await querySession(row.upload_session_url, sizeBytes);
  if (session.state === "incomplete") return { state: "incomplete", row, offset: session.offset };
  if (session.state === "expired") {
    return { state: "failed", row: await markFieldMediaFailed(row.id, "La session d'envoi a expiré. Relancez l'envoi.") };
  }

  const fileId = session.file.id || hint.driveFileId || "";
  const file = fileId ? await getDriveFile(fileId) : null;
  const check = checkFinalizedFile({ sizeBytes, folderId: row.drive_folder_id }, file);
  if (!check.ok) {
    console.error("Studio: field media finalize refused", row.id, check.reason);
    return { state: "failed", row: await markFieldMediaFailed(row.id, check.reason) };
  }

  const driveMillis = Number(file?.videoMediaMetadata?.durationMillis);
  const hinted = Number(hint.durationSeconds);
  const durationSeconds =
    row.kind !== "video"
      ? null
      : Number.isFinite(driveMillis) && driveMillis > 0
        ? Math.round(driveMillis / 10) / 100
        : Number.isFinite(hinted) && hinted > 0 && hinted < 24 * 3600
          ? Math.round(hinted * 100) / 100
          : row.duration_seconds == null
            ? null
            : Number(row.duration_seconds);

  const ready = await updateRow(row.id, {
    status: "ready",
    drive_file_id: file!.id,
    duration_seconds: durationSeconds,
    upload_session_url: null,
    error: null,
  });
  return { state: "ready", row: ready };
}

export async function loadFieldMedia(id: string): Promise<FieldMediaRow | null> {
  const { data } = await supabaseAdmin.from("studio_field_media").select(FIELD_MEDIA_COLUMNS).eq("id", id).maybeSingle();
  return (data as FieldMediaRow | null) ?? null;
}

/** The browser's own origin, so Drive answers its direct uploads with CORS headers. */
export function uploadOrigin(req: Request): string {
  const self = new URL(req.url).origin;
  const origin = req.headers.get("origin");
  return origin && /^https?:\/\/[^/\s]+$/.test(origin) ? origin : self;
}

/**
 * Ready videos must carry duration_seconds (video templates refuse clips
 * without it). Normally it is set at finalize, from Drive's
 * videoMediaMetadata or the browser's measurement. When neither was
 * available yet (Drive still processing, a codec the browser cannot read),
 * this asks Drive again; the list route calls it, a few rows at a time.
 */
export async function backfillVideoDurations(rows: FieldMediaRow[], max = 5): Promise<FieldMediaRow[]> {
  const missing = rows
    .filter((r) => r.kind === "video" && r.status === "ready" && r.drive_file_id && r.duration_seconds == null)
    .slice(0, max);
  if (!missing.length) return rows;
  const filled = new Map<string, number>();
  await Promise.all(
    missing.map(async (row) => {
      try {
        const file = await getDriveFile(row.drive_file_id!);
        const millis = Number(file?.videoMediaMetadata?.durationMillis);
        if (!Number.isFinite(millis) || millis <= 0) return;
        const seconds = Math.round(millis / 10) / 100;
        await updateRow(row.id, { duration_seconds: seconds });
        filled.set(row.id, seconds);
      } catch (error) {
        console.error("Studio: duration backfill failed", row.id, error instanceof Error ? error.message : error);
      }
    }),
  );
  return rows.map((r) => (filled.has(r.id) ? { ...r, duration_seconds: filled.get(r.id)! } : r));
}
