// Field media (photos and videos from a property visit) saved to the shared
// Google Drive "Roogo". Pure rules only, so they can be tested without the
// app's import aliases: folder naming, upload chunks and the checks made
// before a file is marked ready. Safe in the browser (no Node imports); the
// stream-link tokens live in field-media-token.ts.

export type FieldMediaKind = "photo" | "video";
export type FieldMediaStatus = "uploading" | "ready" | "failed";

/** Phone footage is often 100 MB to 1 GB. Drive accepts far more; we stop at 5 GB. */
export const FIELD_MEDIA_MAX_BYTES = 5 * 1024 * 1024 * 1024;

/** Drive wants every chunk but the last to be a multiple of 256 KiB. */
export const DRIVE_CHUNK_UNIT = 256 * 1024;
/** Direct browser to Drive chunks: big enough to be fast, small enough to retry. */
export const DIRECT_CHUNK_BYTES = 64 * DRIVE_CHUNK_UNIT; // 16 MiB
/** Fallback through our server: under Vercel's 4.5 MB request body limit. */
export const PROXY_CHUNK_BYTES = 16 * DRIVE_CHUNK_UNIT; // 4 MiB

const PHOTO_EXT = /\.(jpe?g|png|heic|heif|webp|gif|tiff?|dng)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|3gp|webm|mkv|avi|mts)$/i;

/** Photo or video, from the MIME type, or the extension when iOS leaves it empty. */
export function fieldMediaKind(mimeType: string | null | undefined, fileName: string): FieldMediaKind | null {
  const mime = (mimeType ?? "").toLowerCase().trim();
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (PHOTO_EXT.test(fileName)) return "photo";
  if (VIDEO_EXT.test(fileName)) return "video";
  return null;
}

/** A MIME type Drive can store, guessed from the extension when the browser sends none. */
export function fieldMediaMimeType(mimeType: string | null | undefined, fileName: string): string {
  const mime = (mimeType ?? "").toLowerCase().trim();
  if (mime && /^[a-z]+\/[a-z0-9.+-]+$/.test(mime)) return mime;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
    heif: "image/heif",
    webp: "image/webp",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    "3gp": "video/3gpp",
    webm: "video/webm",
  };
  return byExt[ext] ?? "application/octet-stream";
}

/** File names as Drive will show them: no path, no control characters, at most 200 characters. */
export function cleanFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "fichier").slice(0, 200);
}

/** Field sheet rule: sales go to "Vente", everything else to "Location". */
export function driveTopFolder(listingType: string | null | undefined): "Vente" | "Location" {
  return listingType === "vendre" ? "Vente" : "Location";
}

function tidy(part: string | null | undefined): string {
  return (part ?? "")
    .replace(/[\\/]+/g, " ")
    // Several dash variants become the separator's plain hyphen.
    .replace(/[‒-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Field sheet rule: the visit folder is "Quartier - Nom du propriétaire". */
export function propertyFolderName(quartier: string | null | undefined, ownerName: string | null | undefined): string {
  const place = tidy(quartier) || "Sans quartier";
  const owner = tidy(ownerName) || "Propriétaire inconnu";
  return `${place} - ${owner}`.slice(0, 200);
}

/**
 * The comparison key for folder names, so a folder staff created by hand
 * ("ouaga 2000 – Mme Ouedraogo") is reused instead of duplicated.
 */
export function folderKey(name: string): string {
  return tidy(name)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s*-\s*/g, " - ");
}

export type DriveFolderRef = { id: string; name: string; createdTime?: string | null };

/** The existing folder with the same name (oldest first when there are several), or null. */
export function findFolderMatch(folders: DriveFolderRef[], wanted: string): DriveFolderRef | null {
  const key = folderKey(wanted);
  const matches = folders
    .filter((f) => folderKey(f.name) === key)
    .sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? ""));
  return matches[0] ?? null;
}

/** Escapes a value for a Drive search query (`name = '...'`). */
export function driveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ---------------------------------------------------------------------------
// Upload chunks.

/** Drive's "Range: bytes=0-1048575" answer, as the next byte to send. */
export function nextOffsetFromRange(range: string | null | undefined): number {
  const match = /bytes=0-(\d+)/.exec(range ?? "");
  return match ? Number(match[1]) + 1 : 0;
}

/** The Content-Range header and end of the next chunk to send. */
export function chunkAt(offset: number, size: number, chunkBytes: number): { end: number; contentRange: string } {
  if (chunkBytes % DRIVE_CHUNK_UNIT !== 0) throw new Error("chunk size must be a multiple of 256 KiB");
  const end = Math.min(size, offset + chunkBytes);
  return { end, contentRange: `bytes ${offset}-${end - 1}/${size}` };
}

// ---------------------------------------------------------------------------
// Checks before a file is marked ready.

export type DriveFileFacts = {
  id: string;
  size?: string | number | null;
  parents?: string[] | null;
  trashed?: boolean | null;
  mimeType?: string | null;
};

export type FinalizeCheck = { ok: true } | { ok: false; reason: string };

/**
 * A file is ready only when Drive has it, in the folder we chose, not in the
 * bin, with exactly the size the browser announced.
 */
export function checkFinalizedFile(
  expected: { sizeBytes: number; folderId: string },
  file: DriveFileFacts | null,
): FinalizeCheck {
  if (!file?.id) return { ok: false, reason: "Le fichier est introuvable dans le Drive." };
  if (file.trashed) return { ok: false, reason: "Le fichier est dans la corbeille du Drive." };
  const size = file.size == null ? NaN : Number(file.size);
  if (!Number.isFinite(size) || size !== expected.sizeBytes) {
    return {
      ok: false,
      reason: `Taille incorrecte dans le Drive (${Number.isFinite(size) ? size : "inconnue"} octets au lieu de ${expected.sizeBytes}).`,
    };
  }
  if (!(file.parents ?? []).includes(expected.folderId)) {
    return { ok: false, reason: "Le fichier n'est pas dans le dossier prévu du Drive." };
  }
  return { ok: true };
}

/** Validates what the browser sends to start an upload. */
export function checkUploadRequest(input: {
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  durationSeconds?: unknown;
}):
  | { ok: true; fileName: string; mimeType: string; kind: FieldMediaKind; sizeBytes: number; durationSeconds: number | null }
  | { ok: false; reason: string } {
  const rawName = typeof input.fileName === "string" ? input.fileName : "";
  if (!rawName.trim()) return { ok: false, reason: "Nom de fichier manquant." };
  const fileName = cleanFileName(rawName);
  const mimeType = fieldMediaMimeType(typeof input.mimeType === "string" ? input.mimeType : "", fileName);
  const kind = fieldMediaKind(mimeType, fileName);
  if (!kind) return { ok: false, reason: `${fileName} : seules les photos et les vidéos sont acceptées.` };
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return { ok: false, reason: `${fileName} : fichier vide.` };
  if (sizeBytes > FIELD_MEDIA_MAX_BYTES) return { ok: false, reason: `${fileName} : plus de 5 Go, trop lourd.` };
  const d = Number(input.durationSeconds);
  const durationSeconds = kind === "video" && Number.isFinite(d) && d > 0 && d < 24 * 3600 ? Math.round(d * 100) / 100 : null;
  return { ok: true, fileName, mimeType, kind, sizeBytes, durationSeconds };
}

/** Readable sizes for the panel ("850 Mo", "1,2 Go"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["octets", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit >= 2 && value < 10 ? 1 : 0;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })} ${units[unit]}`;
}

export function driveFileUrl(driveFileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`;
}

export function driveFolderUrl(driveFolderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(driveFolderId)}`;
}
