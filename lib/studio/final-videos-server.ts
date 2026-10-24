// « Publier une vidéo »: the finished videos the team uploads (server only).
// The bytes go from the browser straight to the shared Google Drive, folder
// Videos › « Vidéos finales », through a resumable session opened here as the
// service account: the same mechanism as field media (./field-media.ts), so it
// resumes after a cut on a weak connection and never touches Supabase Storage
// (50 MB project cap) or a Vercel body. That Drive file is the archive copy
// (PRD 2.4) and what Facebook, Instagram and TikTok download through a
// short-lived signed stream link; nothing else is stored, so there is no
// temporary copy to clean up after publishing.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadPropertyRow, propertyLabels } from "./conversations-server";
import { mediaTokenSecret, publicBaseUrl } from "./field-media";
import { signMediaToken, streamTtl, verifyMediaToken } from "./field-media-token";
import { checkFinalizedFile, cleanFileName, driveFileUrl } from "./field-media-rules";
import {
  createResumableSession,
  getDriveFile,
  listChildFolders,
  moveDriveFile,
  querySession,
  renameDriveFile,
  sharedDriveId,
} from "./google-drive";
import {
  checkFinalVideo,
  finalVideoDriveName,
  finalVideoType,
  listingVideoTitle,
  resolveFinalVideoFolders,
  shouldMoveToPublished,
  titleFromFileName,
  type CopyFacts,
  type FinalFolders,
} from "./publish-everywhere";
import type { PublicationResults } from "./publishing";

export const FINAL_VIDEO_COLUMNS =
  "id, property_id, title, file_name, drive_name, mime_type, size_bytes, duration_seconds, width, height, drive_file_id, drive_folder_id, upload_session_url, status, error, published_folder_at, uploaded_by, created_at, updated_at";

export type FinalVideoRow = {
  id: string;
  property_id: string | null;
  title: string;
  file_name: string;
  drive_name: string;
  mime_type: string;
  size_bytes: number | string;
  duration_seconds: number | string | null;
  width: number | null;
  height: number | null;
  drive_file_id: string | null;
  drive_folder_id: string;
  upload_session_url: string | null;
  status: "uploading" | "ready" | "failed";
  error: string | null;
  published_folder_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FinalVideoDto = {
  id: string;
  propertyId: string | null;
  title: string;
  fileName: string;
  driveName: string;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  status: FinalVideoRow["status"];
  error: string | null;
  driveUrl: string | null;
  /** Staff session only (the Studio plays it). */
  streamUrl: string | null;
  publishedFolderAt: string | null;
  createdAt: string;
};

export function finalStreamPath(id: string): string {
  return `/api/admin/studio/final-videos/${encodeURIComponent(id)}/stream`;
}

export function toFinalVideoDto(row: FinalVideoRow): FinalVideoDto {
  return {
    id: row.id,
    propertyId: row.property_id,
    title: row.title,
    fileName: row.file_name,
    driveName: row.drive_name,
    sizeBytes: Number(row.size_bytes),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    width: row.width,
    height: row.height,
    status: row.status,
    error: row.error,
    driveUrl: row.drive_file_id ? driveFileUrl(row.drive_file_id) : null,
    streamUrl: row.status === "ready" ? finalStreamPath(row.id) : null,
    publishedFolderAt: row.published_folder_at,
    createdAt: row.created_at,
  };
}

export async function loadFinalVideo(id: string): Promise<FinalVideoRow | null> {
  const { data } = await supabaseAdmin.from("studio_final_videos").select(FINAL_VIDEO_COLUMNS).eq("id", id).maybeSingle();
  return (data as FinalVideoRow | null) ?? null;
}

async function updateRow(id: string, patch: Partial<FinalVideoRow>): Promise<FinalVideoRow> {
  const { data, error } = await supabaseAdmin.from("studio_final_videos").update(patch).eq("id", id).select(FINAL_VIDEO_COLUMNS).single();
  if (error || !data) throw new Error(`studio_final_videos update failed (${error?.code ?? "no row"})`);
  return data as FinalVideoRow;
}

export function markFinalVideoFailed(id: string, reason: string): Promise<FinalVideoRow> {
  return updateRow(id, { status: "failed", error: reason.slice(0, 500), upload_session_url: null });
}

// ---------------------------------------------------------------------------
// Folders: found by name, the team's ids as the fallback (publish-everywhere).
// ---------------------------------------------------------------------------

let folderCache: { value: FinalFolders; at: number } | null = null;

export async function finalVideoFolders(): Promise<FinalFolders> {
  if (folderCache && Date.now() - folderCache.at < 10 * 60_000) return folderCache.value;
  const value = await resolveFinalVideoFolders(listChildFolders, sharedDriveId(), process.env);
  if (value.source === "config") console.warn("Studio final videos: Drive folders not found by name, using the configured ids");
  folderCache = { value, at: Date.now() };
  return value;
}

// ---------------------------------------------------------------------------
// Upload lifecycle.
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Google keeps a resumable session about a week; we resume for 6 days. */
const RESUME_WINDOW_MS = 6 * 24 * 3600 * 1000;

export type StartInput = {
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  durationSeconds?: unknown;
  width?: unknown;
  height?: unknown;
  title?: unknown;
  propertyId?: unknown;
};

export type StartResult =
  | { ok: true; video: FinalVideoRow; uploadUrl?: string; offset?: number; done?: boolean; resumed?: boolean }
  | { ok: false; status: number; error: string };

/** The title for Drive and for Salif's task: what the team typed, else the listing, else the file name. */
export async function videoTitle(rawTitle: unknown, propertyId: string | null, fileName: string): Promise<string> {
  const typed = typeof rawTitle === "string" ? rawTitle.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (typed) return typed;
  if (propertyId) {
    const row = await loadPropertyRow(propertyId);
    if (row) {
      const title = listingVideoTitle(propertyLabels.type(row.property_type ?? undefined), row.quartier, propertyLabels.city(row.city));
      if (title) return title;
    }
  }
  return titleFromFileName(fileName) || "Vidéo";
}

/**
 * Starts (or resumes) one upload. The size, length and shape the browser
 * measured are checked again here (PRD 2.3); the session is opened in
 * « Vidéos finales » under its French descriptive name (PRD 2.4).
 */
export async function startFinalVideoUpload(uploaderId: string, body: StartInput, origin: string | null, now = new Date()): Promise<StartResult> {
  const rawName = typeof body.fileName === "string" ? body.fileName : "";
  if (!rawName.trim()) return { ok: false, status: 400, error: "Nom de fichier manquant." };
  const fileName = cleanFileName(rawName);
  const facts = {
    fileName,
    mimeType: typeof body.mimeType === "string" ? body.mimeType : "",
    sizeBytes: Number(body.sizeBytes),
    durationSeconds: Number(body.durationSeconds),
    width: Number(body.width),
    height: Number(body.height),
  };
  const check = checkFinalVideo(facts);
  if (!check.ok) return { ok: false, status: 400, error: check.message };

  const propertyId = typeof body.propertyId === "string" && UUID.test(body.propertyId) ? body.propertyId : null;
  if (propertyId) {
    const { data } = await supabaseAdmin.from("properties").select("id").eq("id", propertyId).maybeSingle();
    if (!data) return { ok: false, status: 404, error: "Bien introuvable." };
  }

  // Same person, same file name and size, unfinished: resume it.
  const { data: previous } = await supabaseAdmin
    .from("studio_final_videos")
    .select(FINAL_VIDEO_COLUMNS)
    .eq("uploaded_by", uploaderId)
    .eq("file_name", fileName)
    .eq("size_bytes", facts.sizeBytes)
    .eq("status", "uploading")
    .gte("created_at", new Date(now.getTime() - RESUME_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const old = (previous?.[0] as FinalVideoRow | undefined) ?? null;
  if (old?.upload_session_url) {
    const session = await querySession(old.upload_session_url, facts.sizeBytes);
    if (session.state === "incomplete") return { ok: true, video: old, uploadUrl: old.upload_session_url, offset: session.offset, resumed: true };
    if (session.state === "complete") {
      const done = await finalizeFinalVideo(old);
      if (done.state === "ready") return { ok: true, video: done.row, done: true };
    } else {
      await markFinalVideoFailed(old.id, "La session d'envoi a expiré.");
    }
  }

  const title = await videoTitle(body.title, propertyId, fileName);
  const driveName = finalVideoDriveName({ title, date: now, ext: check.ext });
  const folders = await finalVideoFolders();
  const uploadUrl = await createResumableSession({
    name: driveName,
    mimeType: check.mimeType,
    sizeBytes: facts.sizeBytes,
    folderId: folders.finalId,
    origin,
  });
  const { data: row, error } = await supabaseAdmin
    .from("studio_final_videos")
    .insert({
      property_id: propertyId,
      title,
      file_name: fileName,
      drive_name: driveName,
      mime_type: check.mimeType,
      size_bytes: facts.sizeBytes,
      duration_seconds: Math.round(facts.durationSeconds * 100) / 100,
      width: Math.round(facts.width),
      height: Math.round(facts.height),
      drive_folder_id: folders.finalId,
      upload_session_url: uploadUrl,
      status: "uploading",
      uploaded_by: uploaderId,
    })
    .select(FINAL_VIDEO_COLUMNS)
    .single();
  if (error || !row) {
    console.error("Studio final videos: insert failed", error?.code);
    return { ok: false, status: 500, error: "Erreur du Studio" };
  }
  return { ok: true, video: row as FinalVideoRow, uploadUrl, offset: 0, resumed: false };
}

export type FinalizeResult =
  | { state: "ready" | "failed"; row: FinalVideoRow }
  | { state: "incomplete"; row: FinalVideoRow; offset: number };

/**
 * Ready only after Drive confirms the file in « Vidéos finales » at the
 * announced size (the Drive copy is confirmed, PRD 2.4). When Drive already
 * measured the video, its width, height and length are checked again.
 */
export async function finalizeFinalVideo(row: FinalVideoRow, hint: { driveFileId?: string | null } = {}): Promise<FinalizeResult> {
  if (row.status !== "uploading") return { state: row.status, row };
  if (!row.upload_session_url) return { state: "failed", row: await markFinalVideoFailed(row.id, "Session d'envoi perdue. Relancez l'envoi.") };
  const sizeBytes = Number(row.size_bytes);
  const session = await querySession(row.upload_session_url, sizeBytes);
  if (session.state === "incomplete") return { state: "incomplete", row, offset: session.offset };
  if (session.state === "expired") return { state: "failed", row: await markFinalVideoFailed(row.id, "La session d'envoi a expiré. Relancez l'envoi.") };

  const fileId = session.file.id || hint.driveFileId || "";
  const file = fileId ? await getDriveFile(fileId) : null;
  const check = checkFinalizedFile({ sizeBytes, folderId: row.drive_folder_id }, file);
  if (!check.ok) {
    console.error("Studio final videos: finalize refused", row.id, check.reason);
    return { state: "failed", row: await markFinalVideoFailed(row.id, check.reason) };
  }
  const meta = file?.videoMediaMetadata ?? null;
  const millis = Number(meta?.durationMillis);
  const measured = {
    durationSeconds: Number.isFinite(millis) && millis > 0 ? Math.round(millis / 10) / 100 : Number(row.duration_seconds),
    width: Number(meta?.width) > 0 ? Number(meta?.width) : row.width,
    height: Number(meta?.height) > 0 ? Number(meta?.height) : row.height,
  };
  const again = checkFinalVideo({ fileName: row.file_name, mimeType: row.mime_type, sizeBytes, ...measured });
  if (!again.ok) {
    console.error("Studio final videos: Drive measurement refused", row.id, again.code);
    return { state: "failed", row: await markFinalVideoFailed(row.id, again.message) };
  }
  const ready = await updateRow(row.id, {
    status: "ready",
    drive_file_id: file!.id,
    duration_seconds: measured.durationSeconds,
    width: measured.width,
    height: measured.height,
    upload_session_url: null,
    error: null,
  });
  return { state: "ready", row: ready };
}

// ---------------------------------------------------------------------------
// Signed stream links for Meta and TikTok (same HMAC as field media, with its
// own prefix so a field media link never opens a final video and back).
// ---------------------------------------------------------------------------

const TOKEN_PREFIX = "final:";

export async function signedFinalVideoUrl(id: string, ttlSeconds?: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + streamTtl(ttlSeconds);
  const token = signMediaToken(mediaTokenSecret(), `${TOKEN_PREFIX}${id}`, exp);
  return `${publicBaseUrl()}${finalStreamPath(id)}?exp=${exp}&token=${token}`;
}

export function verifyFinalVideoToken(id: string, exp: string | null, token: string | null): boolean {
  try {
    return verifyMediaToken(mediaTokenSecret(), `${TOKEN_PREFIX}${id}`, exp, token);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// After « Envoyer à Salif » and after publishing.
// ---------------------------------------------------------------------------

/** Renames the Drive copy when the title or listing changed before sending. Never blocks the send. */
export async function renameForSend(row: FinalVideoRow, title: string): Promise<FinalVideoRow> {
  const type = finalVideoType(row.mime_type, row.file_name);
  const name = finalVideoDriveName({ title, date: row.created_at, ext: type?.ext ?? "mp4" });
  if (name === row.drive_name && title === row.title) return row;
  try {
    if (row.drive_file_id && name !== row.drive_name) await renameDriveFile(row.drive_file_id, name);
    return await updateRow(row.id, { title, drive_name: name });
  } catch (error) {
    console.error("Studio final videos: rename failed", row.id, error instanceof Error ? error.message : error);
    return row;
  }
}

/**
 * PRD 2.4b: once the post is out on every network, the Drive copy moves from
 * « Vidéos finales » to « Publié ». Called by the publisher after each run;
 * a failure is logged and tried again after the next run that touches it.
 */
export async function moveFinalVideoIfPublished(
  videoId: string | null,
  post: { status: string; networks: string[]; results: PublicationResults },
): Promise<boolean> {
  if (!videoId) return false;
  const video = await loadFinalVideo(videoId);
  const decision = shouldMoveToPublished(video, post);
  if (!decision.move || !video?.drive_file_id) return false;
  try {
    const folders = await finalVideoFolders();
    await moveDriveFile(video.drive_file_id, video.drive_folder_id, folders.publishedId);
    await updateRow(video.id, { drive_folder_id: folders.publishedId, published_folder_at: new Date().toISOString() });
    return true;
  } catch (error) {
    console.error("Studio final videos: move to Publié failed", video.id, error instanceof Error ? error.message : error);
    return false;
  }
}

/** Facts the code inserts into every text (PRD 3.2), from the linked listing only. */
export async function copyFactsFor(propertyId: string | null): Promise<CopyFacts & { reference: string | null; summary: { title: string; offer: string; place: string; price: string } | null }> {
  if (!propertyId) return { listingType: null, price: null, priceLabel: null, place: null, reference: null, summary: null };
  const row = await loadPropertyRow(propertyId);
  if (!row) return { listingType: null, price: null, priceLabel: null, place: null, reference: null, summary: null };
  const { data: ref } = await supabaseAdmin.from("properties").select("reference").eq("id", propertyId).maybeSingle();
  const price = row.price === null || row.price === undefined || row.price === "" ? null : Number(row.price);
  const amount = price != null && Number.isFinite(price) ? `${propertyLabels.amount(price)} FCFA`.replace(/[  ]/g, " ") : null;
  const priceLabel = amount ? (row.listing_type === "vendre" ? amount : `${amount} ${row.frequence === "journalier" ? "par nuit" : "par mois"}`) : null;
  const place = (row.quartier ?? "").trim() || propertyLabels.city(row.city) || null;
  return {
    listingType: row.listing_type === "vendre" ? "vendre" : row.listing_type === "louer" ? "louer" : null,
    price: price != null && Number.isFinite(price) ? price : null,
    priceLabel,
    place,
    city: propertyLabels.city(row.city) || null,
    propertyType: row.property_type,
    reference: (ref?.reference as string | null | undefined) ?? null,
    summary: {
      title: listingVideoTitle(propertyLabels.type(row.property_type ?? undefined), row.quartier, propertyLabels.city(row.city)),
      offer: row.listing_type === "vendre" ? "À vendre" : "À louer",
      place: place ?? "",
      price: priceLabel ?? "",
    },
  };
}
