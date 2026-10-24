// Resumable upload of one vertical Short to the Roogo YouTube channel
// (videos.insert with uploadType=resumable). Tested but NOT wired yet: the
// « Publier partout » PR (PRD 2) calls uploadYouTubeShort from its worker,
// with the token from getFreshYouTubeAccess (lib/team-goals/youtube-store.ts).
//
// Protocol (https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol):
//   1. POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
//      JSON body { snippet, status }, headers X-Upload-Content-Length and
//      X-Upload-Content-Type. The answer's Location header is the session URL.
//   2. PUT the bytes to the session URL, in chunks that are multiples of
//      256 KiB, each with Content-Range: bytes <first>-<last>/<total>.
//      308 « Resume Incomplete » with Range: bytes=0-<last> means « send the
//      rest from last + 1 »; 200 or 201 carries the video resource ({ id }).
//   3. After a network error or a 5xx, PUT with Content-Range: bytes */<total>
//      asks how much arrived, then the upload resumes from there.
//
// Quota: one videos.insert costs 1 600 units of the 10 000 a day. Until the
// Google Cloud project passes the YouTube API Services audit, videos uploaded
// through the API are locked private by YouTube whatever privacyStatus says.
//
// No imports: node:test loads this file directly with a fake fetch
// (youtube-upload.test.mjs). The token is sent in the Authorization header
// and never appears in a message or a log.

export const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
/** Chunks must be multiples of 256 KiB (except the last one). */
export const CHUNK_UNIT = 256 * 1024;
export const DEFAULT_CHUNK_SIZE = 32 * CHUNK_UNIT; // 8 MiB
export const SHORT_MAX_SECONDS = 180;
export const TITLE_MAX = 100;
/** YouTube counts the description in bytes (5 000). */
export const DESCRIPTION_MAX_BYTES = 5000;
const MAX_RETRIES = 4;

export type PrivacyStatus = "private" | "unlisted" | "public";

export type ShortInput = {
  title: string;
  description: string;
  privacyStatus: PrivacyStatus;
  /** Known from the uploaded file; #Shorts is added only when the video is vertical and 3 minutes or less. */
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  tags?: string[];
  /** YouTube category « People & Blogs » (22) by default. */
  categoryId?: string;
};

export type UploadFetch = (
  url: string,
  init: { method: "POST" | "PUT"; headers: Record<string, string>; body?: string | Uint8Array; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; json: () => Promise<unknown> }>;

/** Vertical (taller than wide) and 3 minutes or less. Unknown dimensions or duration: not a Short. */
export function isShortCandidate(input: Pick<ShortInput, "width" | "height" | "durationSeconds">): boolean {
  const { width, height, durationSeconds } = input;
  if (!width || !height || durationSeconds == null) return false;
  return height > width && durationSeconds > 0 && durationSeconds <= SHORT_MAX_SECONDS;
}

function utf8Length(text: string) {
  return new TextEncoder().encode(text).length;
}

/** Cuts `text` so it fits in `maxBytes` of UTF-8 without breaking a character. */
function fitBytes(text: string, maxBytes: number) {
  if (utf8Length(text) <= maxBytes) return text;
  let out = "";
  for (const ch of text) {
    if (utf8Length(out + ch) > maxBytes) break;
    out += ch;
  }
  return out;
}

/**
 * The { snippet, status } body of videos.insert. YouTube refuses « < » and
 * « > » in titles and descriptions, so they are removed; the title is cut at
 * 100 characters, the description at 5 000 bytes, keeping room for #Shorts.
 */
export function buildShortMetadata(input: ShortInput) {
  const clean = (t: string) => t.replace(/[<>]/g, "").trim();
  const title = [...clean(input.title).replace(/\s+/g, " ")].slice(0, TITLE_MAX).join("") || "Roogo";
  let description = clean(input.description);
  if (isShortCandidate(input) && !/(^|\s)#shorts\b/i.test(description)) {
    const tag = "#Shorts";
    description = `${fitBytes(description, DESCRIPTION_MAX_BYTES - utf8Length(tag) - 2)}${description ? "\n\n" : ""}${tag}`;
  } else {
    description = fitBytes(description, DESCRIPTION_MAX_BYTES);
  }
  const tags = (input.tags ?? []).map((t) => clean(t)).filter(Boolean).slice(0, 30);
  return {
    snippet: { title, description, categoryId: input.categoryId ?? "22", ...(tags.length ? { tags } : {}) },
    status: { privacyStatus: input.privacyStatus, selfDeclaredMadeForKids: false, embeddable: true },
  };
}

export type UploadResult =
  | { ok: true; videoId: string; url: string }
  | { ok: false; error: string; status?: number; reason?: string | null };

/** French reason from a Google error body. Never includes the token. */
export function frenchUploadError(status: number, body: unknown): { error: string; reason: string | null } {
  const err = (body as { error?: { message?: unknown; errors?: { reason?: unknown }[] } } | null)?.error;
  const reason = typeof err?.errors?.[0]?.reason === "string" ? err.errors[0].reason : null;
  if (status === 401) return { reason, error: "Le jeton YouTube a expiré ou a été révoqué : reconnecter YouTube dans Statistiques." };
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") return { reason, error: "Le quota YouTube du jour est atteint. Réessayez demain." };
  if (reason === "uploadLimitExceeded") return { reason, error: "La chaîne a atteint sa limite de mises en ligne pour aujourd'hui." };
  if (reason === "insufficientPermissions" || status === 403) {
    return { reason, error: "Permission youtube.upload manquante : reconnecter YouTube dans Statistiques." };
  }
  if (reason === "invalidTitle" || reason === "invalidDescription") return { reason, error: "Titre ou description refusé par YouTube." };
  const message = typeof err?.message === "string" ? err.message.replace(/https?:\/\/\S+/g, "[lien]").slice(0, 160) : "";
  return { reason, error: `YouTube a refusé la vidéo (HTTP ${status}${reason ? `, ${reason}` : ""})${message ? ` : ${message}` : ""}` };
}

/** The last byte YouTube has, from a 308 « Range: bytes=0-123 » header (-1 when nothing arrived). */
export function lastByteOf(range: string | null): number {
  const m = range ? /bytes=0-(\d+)/.exec(range) : null;
  return m ? Number(m[1]) : -1;
}

export function videoUrl(videoId: string, short: boolean) {
  return short ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`;
}

/** Step 1: opens the resumable session and returns its URL. */
export async function startResumableSession(
  token: string,
  metadata: ReturnType<typeof buildShortMetadata>,
  file: { size: number; contentType: string },
  fetchImpl: UploadFetch,
): Promise<{ ok: true; sessionUrl: string } | { ok: false; error: string; status?: number; reason?: string | null }> {
  const url = `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(file.size),
        "X-Upload-Content-Type": file.contentType,
      },
      body: JSON.stringify(metadata),
    });
  } catch (error) {
    return { ok: false, error: `Pas de réponse de YouTube : ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { ok: false, status: res.status, ...frenchUploadError(res.status, body) };
  }
  const sessionUrl = res.headers.get("location");
  if (!sessionUrl) return { ok: false, status: res.status, error: "YouTube n'a pas ouvert de session de mise en ligne (pas d'en-tête Location)." };
  return { ok: true, sessionUrl };
}

/**
 * Uploads one Short and returns its URL. Never throws. Network errors and
 * 5xx answers are retried up to 4 times from the last byte YouTube confirms.
 * `bytes` is the whole file (the publishing worker downloads it from its
 * signed URL first, as it does for TikTok).
 */
export async function uploadYouTubeShort(
  args: { token: string; bytes: Uint8Array; contentType: string; input: ShortInput; chunkSize?: number },
  fetchImpl: UploadFetch,
): Promise<UploadResult> {
  const { token, bytes, contentType, input } = args;
  const total = bytes.byteLength;
  if (!total) return { ok: false, error: "Le fichier vidéo est vide." };
  const chunk = Math.max(CHUNK_UNIT, Math.floor((args.chunkSize ?? DEFAULT_CHUNK_SIZE) / CHUNK_UNIT) * CHUNK_UNIT);
  const metadata = buildShortMetadata(input);
  const session = await startResumableSession(token, metadata, { size: total, contentType }, fetchImpl);
  if (!session.ok) return session;
  const short = isShortCandidate(input);

  let offset = 0;
  let retries = 0;
  while (offset < total) {
    const end = Math.min(offset + chunk, total) - 1;
    let res;
    try {
      res = await fetchImpl(session.sessionUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType, "Content-Range": `bytes ${offset}-${end}/${total}` },
        body: bytes.subarray(offset, end + 1),
      });
    } catch {
      res = null;
    }

    if (res && (res.status === 200 || res.status === 201)) {
      const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
      if (typeof body?.id !== "string" || !body.id) return { ok: false, status: res.status, error: "YouTube a reçu la vidéo sans renvoyer son identifiant." };
      return { ok: true, videoId: body.id, url: videoUrl(body.id, short) };
    }
    if (res && res.status === 308) {
      offset = lastByteOf(res.headers.get("range")) + 1;
      retries = 0;
      continue;
    }
    if (res && res.status < 500 && res.status !== 429) {
      const body = await res.json().catch(() => null);
      return { ok: false, status: res.status, ...frenchUploadError(res.status, body) };
    }

    // Network error, 5xx or 429: ask YouTube how much it has, then resume.
    retries += 1;
    if (retries > MAX_RETRIES) {
      return { ok: false, status: res?.status, error: `La mise en ligne YouTube a échoué après ${MAX_RETRIES} reprises${res ? ` (HTTP ${res.status})` : ""}.` };
    }
    try {
      const probe = await fetchImpl(session.sessionUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Range": `bytes */${total}` },
      });
      if (probe.status === 200 || probe.status === 201) {
        const body = (await probe.json().catch(() => null)) as { id?: unknown } | null;
        if (typeof body?.id === "string" && body.id) return { ok: true, videoId: body.id, url: videoUrl(body.id, short) };
      }
      if (probe.status === 308) offset = lastByteOf(probe.headers.get("range")) + 1;
      else if (probe.status === 404 || probe.status === 410) return { ok: false, status: probe.status, error: "La session de mise en ligne YouTube a expiré. Recommencez." };
    } catch {
      // Keep the offset; the next attempt sends the same chunk again.
    }
  }
  return { ok: false, error: "Mise en ligne YouTube interrompue." };
}
