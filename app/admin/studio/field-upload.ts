// Browser side of field media uploads. Each file goes straight from the
// browser to Google Drive in 16 MiB chunks through a resumable session the
// server opened, so neither Supabase (50 MB) nor Vercel (4.5 MB bodies) sees
// the bytes. If Google refuses the browser (CORS, network filter), the same
// session is fed in 4 MiB chunks through /api/admin/studio/media/[id]/chunk.
// After a network error the upload continues from the byte Google kept.

import { chunkAt, fieldMediaKind, nextOffsetFromRange } from "@/lib/studio/field-media-rules";

export type FieldMedia = {
  id: string;
  kind: "photo" | "video" | "file";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  status: "uploading" | "ready" | "failed";
  driveFileId: string | null;
  createdAt: string;
  driveUrl: string | null;
  folderPath: string | null;
  error: string | null;
};

type StartAnswer = {
  media: FieldMedia;
  uploadUrl?: string;
  offset?: number;
  done?: boolean;
  directChunkBytes?: number;
  proxyChunkBytes?: number;
};

const MAX_FAILURES_IN_A_ROW = 6;
let proxyOnly = false; // once Google refuses this browser, stay on the relay for the session

export class UploadError extends Error {}

async function apiJson<T>(input: string, init?: RequestInit): Promise<{ status: number; body: T & { error?: string } }> {
  const res = await fetch(input, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { status: res.status, body };
}

/** A video's length from its metadata, or null after 6 s (HEVC in Chrome, for example). */
export function readVideoDuration(file: File): Promise<number | null> {
  if (fieldMediaKind(file.type, file.name) !== "video") return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 6000);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

type PutResult = { status: number; range: string | null; text: string };

function put(url: string, body: Blob, headers: Record<string, string>, onSent: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<PutResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (event) => onSent(event.loaded);
    xhr.onload = () => {
      let range: string | null = null;
      try {
        range = xhr.getResponseHeader("Range");
      } catch {
        range = null; // not exposed by CORS
      }
      resolve({ status: xhr.status, range, text: xhr.responseText });
    };
    xhr.onerror = () => resolve({ status: 0, range: null, text: "" });
    xhr.ontimeout = () => resolve({ status: 0, range: null, text: "" });
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function serverOffset(mediaId: string): Promise<{ offset: number | null; complete: boolean; media: FieldMedia }> {
  const { status, body } = await apiJson<{ offset: number | null; complete: boolean; media: FieldMedia }>(
    `/api/admin/studio/media/${mediaId}`,
  );
  if (status !== 200) throw new UploadError(body.error ?? `Suivi de l'envoi impossible (${status}).`);
  if (body.media.status === "failed") throw new UploadError(body.media.error ?? "Envoi échoué.");
  return body;
}

/**
 * Sends one file and returns its index row once the server has checked it in
 * Drive. `onProgress` gets the number of bytes Google has (or is receiving).
 */
export async function uploadFieldFile(
  file: File,
  propertyId: string,
  onProgress: (sentBytes: number) => void,
  signal?: AbortSignal,
  /** From the field visit sheet: the sheet and the deliverable (its own Drive subfolder). */
  sheet?: { fieldVisitId: string; deliverable: string },
): Promise<FieldMedia> {
  const durationSeconds = await readVideoDuration(file);
  const start = await apiJson<StartAnswer>("/api/admin/studio/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId, fileName: file.name, mimeType: file.type, sizeBytes: file.size, durationSeconds, ...(sheet ?? {}) }),
    signal,
  });
  if (start.status !== 200) throw new UploadError(start.body.error ?? `Envoi refusé (${start.status}).`);
  const { media } = start.body;
  if (start.body.done) {
    onProgress(file.size);
    return media;
  }

  const size = file.size;
  const uploadUrl = start.body.uploadUrl!;
  const directChunk = start.body.directChunkBytes ?? 16 * 1024 * 1024;
  const proxyChunk = start.body.proxyChunkBytes ?? 4 * 1024 * 1024;
  let offset = start.body.offset ?? 0;
  let driveFileId: string | null = null;
  let failures = 0;
  let directWorked = false;
  onProgress(offset);

  for (let finalizeTries = 0; finalizeTries < 3; finalizeTries += 1) {
    while (offset < size) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const direct = !proxyOnly;
      const { end, contentRange } = chunkAt(offset, size, direct ? directChunk : proxyChunk);
      const from = offset;
      const result = direct
        ? await put(uploadUrl, file.slice(from, end), { "Content-Range": contentRange }, (n) => onProgress(from + n), signal)
        : await put(
            `/api/admin/studio/media/${media.id}/chunk`,
            file.slice(from, end),
            { "X-Content-Range": contentRange, "Content-Type": "application/octet-stream" },
            (n) => onProgress(from + n),
            signal,
          );

      if (direct && (result.status === 200 || result.status === 201)) {
        driveFileId = safeId(result.text);
        offset = size;
        directWorked = true;
        break;
      }
      if (direct && result.status === 308) {
        offset = result.range ? nextOffsetFromRange(result.range) : ((await serverOffset(media.id)).offset ?? end);
        directWorked = true;
        failures = 0;
        continue;
      }
      if (!direct && result.status === 200) {
        const answer = safeJson<{ complete?: boolean; offset?: number; driveFileId?: string | null }>(result.text);
        offset = answer?.complete ? size : (answer?.offset ?? from);
        if (answer?.driveFileId) driveFileId = answer.driveFileId;
        failures = 0;
        continue;
      }
      if (result.status === 0 && direct && !directWorked) {
        // Google refused the browser before any chunk went through: use the relay.
        proxyOnly = true;
        console.warn("Studio: direct Drive upload refused, switching to the relay");
      } else if (result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429) {
        const reason = safeJson<{ error?: string }>(result.text)?.error;
        throw new UploadError(reason ?? `Envoi refusé par le serveur (${result.status}).`);
      } else if (++failures > MAX_FAILURES_IN_A_ROW) {
        throw new UploadError(`Connexion perdue trop souvent (dernier statut ${result.status}).`);
      } else {
        await wait(Math.min(30_000, 1000 * 2 ** failures));
      }
      // Continue from what Google really kept.
      const now = await serverOffset(media.id);
      offset = now.complete ? size : (now.offset ?? from);
      onProgress(offset);
    }

    const done = await apiJson<{ media: FieldMedia; offset?: number }>(`/api/admin/studio/media/${media.id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveFileId, durationSeconds }),
    });
    if (done.status === 200) {
      onProgress(size);
      return done.body.media;
    }
    if (done.status === 409 && typeof done.body.offset === "number") {
      offset = done.body.offset; // Google is missing bytes: send them, then check again
      continue;
    }
    throw new UploadError(done.body.media?.error ?? done.body.error ?? `Vérification impossible (${done.status}).`);
  }
  throw new UploadError("Le Drive n'a pas confirmé le fichier complet.");
}

function safeJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function safeId(text: string): string | null {
  const id = safeJson<{ id?: unknown }>(text)?.id;
  return typeof id === "string" ? id : null;
}
