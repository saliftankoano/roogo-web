// Resumable upload of one vertical Short to the Roogo YouTube channel
// (videos.insert with uploadType=resumable). The « Publier une vidéo » worker
// (lib/studio/publishing-server.ts) calls publishYouTubeShort: the video is
// read from the Drive copy one chunk at a time (lib/studio/range-source.ts)
// and the session URL plus the next byte are saved, so a run that reaches its
// time budget stops and the next run continues without posting twice. The
// token comes from getFreshYouTubeAccess (lib/team-goals/youtube-store.ts).
// uploadYouTubeShort (whole file in memory) is kept for small files and tests.
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
// through the API are locked private by YouTube whatever privacyStatus says:
// the final answer then carries status.privacyStatus « private » and the
// result note says so (privacyNote).
//
// Visibility (2026-10-30, youtubeVisibility): a post whose Studio time is
// still ahead goes up « private » with status.publishAt (ISO 8601 UTC), so
// YouTube makes it public itself at that time; a post that is due goes up
// « public ». The Studio stores scheduled_at as timestamptz in UTC, which is
// also Ouagadougou time (UTC+0, no daylight saving).
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
  /** ISO 8601 UTC: YouTube turns the video public at this time (privacyStatus must be « private »). */
  publishAt?: string | null;
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
    status: {
      // YouTube only accepts publishAt on a private video.
      privacyStatus: input.publishAt ? ("private" as const) : input.privacyStatus,
      ...(input.publishAt ? { publishAt: input.publishAt } : {}),
      selfDeclaredMadeForKids: false,
      embeddable: true,
    },
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

// ---------------------------------------------------------------------------
// « Publier une vidéo »: chunked, resumable across runs (2026-10-24).
// ---------------------------------------------------------------------------

/** YOUTUBE_PUBLIC_UPLOADS=false: every Short stays private. */
export const YOUTUBE_PRIVATE_NOTE = "YouTube : publication privée (YOUTUBE_PUBLIC_UPLOADS=false sur le serveur)";
export const YOUTUBE_PUBLIC_NOTE = "YouTube : le Short devient public à l'heure prévue dans le Studio";
/** YouTube answered « private » although public or a publishAt was asked: the API audit lock. */
export const YOUTUBE_LOCKED_NOTE =
  "YouTube a gardé la vidéo privée : le projet Google Cloud n'a pas encore passé l'audit de l'API YouTube. Elle doit être rendue publique dans YouTube Studio";
/** A Studio time less than this ahead is treated as « now » (publishAt must be in the future when YouTube reads it). */
export const PUBLISH_AT_MIN_LEAD_MS = 2 * 60_000;
/** Google keeps a resumable session about a week; we resume within 6 days, else start again. */
export const SESSION_TTL_MS = 6 * 24 * 3600_000;
/** Do not start a chunk when less than this is left before the run's deadline. */
export const YOUTUBE_CHUNK_TIME_MARGIN_MS = 30_000;
/** One videos.insert costs 1 600 of the 10 000 quota units of a day. */
export const UPLOAD_QUOTA_COST = 1600;
export const DAILY_QUOTA = 10_000;
/** Automatic next-day attempts after a quota error, then the team uses « Réessayer ». */
export const MAX_QUOTA_RETRIES = 3;
export const QUOTA_ERROR =
  "Quota YouTube du jour atteint (une vidéo coûte 1 600 unités sur 10 000 par jour). Nouvel essai automatique demain à partir de 8 h.";

/** Public by default; YOUTUBE_PUBLIC_UPLOADS=false keeps every Short private (kill switch). */
export function youtubePrivacy(env: Record<string, string | undefined>): PrivacyStatus {
  return env.YOUTUBE_PUBLIC_UPLOADS?.trim().toLowerCase() === "false" ? "private" : "public";
}

/**
 * privacyStatus and publishAt for a post scheduled at `scheduledAt` (the
 * Studio's scheduled_at, UTC): a time still ahead gives « private » plus
 * publishAt so YouTube publishes it then; a time now or past gives « public ».
 */
export function youtubeVisibility(
  env: Record<string, string | undefined>,
  scheduledAt: string | null | undefined,
  now: Date,
): { privacyStatus: PrivacyStatus; publishAt: string | null } {
  if (youtubePrivacy(env) === "private") return { privacyStatus: "private", publishAt: null };
  const at = scheduledAt ? Date.parse(scheduledAt) : NaN;
  if (Number.isFinite(at) && at - now.getTime() >= PUBLISH_AT_MIN_LEAD_MS) {
    return { privacyStatus: "private", publishAt: new Date(at).toISOString().replace(/\.\d{3}Z$/, "Z") };
  }
  return { privacyStatus: "public", publishAt: null };
}

/** The result note, from what was asked and what YouTube answered (status of the video resource). */
export function privacyNote(input: Pick<ShortInput, "privacyStatus" | "publishAt">, answered: { privacyStatus?: unknown; publishAt?: unknown } | null): string {
  const askedPublic = input.privacyStatus === "public" || !!input.publishAt;
  const got = typeof answered?.privacyStatus === "string" ? answered.privacyStatus : null;
  if (askedPublic && got === "private" && !answered?.publishAt) return YOUTUBE_LOCKED_NOTE;
  if (input.publishAt) {
    const when = new Date(input.publishAt).toLocaleString("fr-FR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" });
    return `Programmée sur YouTube : publique le ${when} (heure de Ouagadougou)`;
  }
  return input.privacyStatus === "public" ? "Publiée en Short" : "Publiée en privé (visible par la chaîne seulement)";
}

export function youtubeNote(privacy: PrivacyStatus): string {
  return privacy === "public" ? YOUTUBE_PUBLIC_NOTE : YOUTUBE_PRIVATE_NOTE;
}

/**
 * When the quota is back: Google resets it at midnight Pacific time, which is
 * 07:00 or 08:00 UTC. 08:00 UTC is always after the reset (08:00 in Ouaga).
 */
export function nextQuotaReset(now: Date): string {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0));
  if (reset.getTime() <= now.getTime()) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset.toISOString();
}

export function isQuotaReason(reason: string | null | undefined): boolean {
  return reason === "quotaExceeded" || reason === "dailyLimitExceeded";
}

export type YouTubePublishInfo = {
  enabled: boolean;
  /** French reason when not enabled. */
  reason: string | null;
  privacy: PrivacyStatus;
  note: string;
};

/** Whether « YouTube Shorts » can be ticked, from the connection status (getYouTubeStatus). */
export function youtubePublishInfo(
  status: { configured: boolean; missing?: string[]; tableReady: boolean; connected: boolean; canUpload: boolean } | null,
  env: Record<string, string | undefined>,
): YouTubePublishInfo {
  const privacy = youtubePrivacy(env);
  const note = youtubeNote(privacy);
  const off = (reason: string): YouTubePublishInfo => ({ enabled: false, reason, privacy, note });
  if (!status) return off("Le statut YouTube n'a pas pu être lu. Réessayez plus tard.");
  if (!status.configured) return off(`YouTube n'est pas configuré sur le serveur (${(status.missing ?? []).join(", ") || "YOUTUBE_CLIENT_ID"}).`);
  if (!status.tableReady) return off("La connexion YouTube n'est pas encore installée (migration 106 à lancer).");
  if (!status.connected) return off("La chaîne YouTube n'est pas connectée (Studio, Statistiques, Connecter YouTube).");
  if (!status.canUpload) return off("Reconnectez YouTube en autorisant la mise en ligne (youtube.upload).");
  return { enabled: true, reason: null, privacy, note };
}

/** Where an interrupted upload continues (saved in the results, never sent to the browser). */
export type YouTubeResume = {
  session_url: string;
  /** First byte YouTube does not have yet. */
  next_byte: number;
  total: number;
  /** After this, the session is considered dead: start a new one (nothing was posted). */
  expires_at: string;
};

export type YouTubeVideoSource = {
  size: () => Promise<number>;
  /** Bytes start..end inclusive, read with a Range request: never the whole file. */
  readRange: (start: number, end: number) => Promise<Uint8Array>;
};

/** Same shape as NetworkResult in lib/studio/publishing.ts (kept import-free for tests). */
export type YouTubeNetworkResult = {
  status: "published" | "failed" | "pending";
  remote_id?: string | null;
  permalink?: string | null;
  error?: string | null;
  published_at?: string | null;
  note?: string | null;
  resume?: YouTubeResume | null;
  /** Quota error: when the worker tries again by itself. */
  retry_after?: string | null;
};

export type YouTubePublishDeps = {
  fetch: UploadFetch;
  video: YouTubeVideoSource;
  contentType: string;
  /** Epoch ms: no chunk starts past this minus the margin. */
  deadline?: number;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Multiple of 256 KiB (rounded down); 8 MiB by default. */
  chunkSize?: number;
  /** Saves the session and position after each chunk, so a dead run never loses or repeats the upload. */
  onProgress?: (partial: YouTubeNetworkResult) => Promise<void> | void;
};

function shortsUrl(videoId: string) {
  return `https://youtube.com/shorts/${videoId}`;
}

type Answered = { id: string; status: { privacyStatus?: unknown; publishAt?: unknown } | null };

async function idOf(res: { json: () => Promise<unknown> }): Promise<Answered | null> {
  const body = (await res.json().catch(() => null)) as { id?: unknown; status?: Answered["status"] } | null;
  return typeof body?.id === "string" && body.id ? { id: body.id, status: body.status ?? null } : null;
}

/**
 * Publishes one Short, reading the video chunk by chunk (multiples of
 * 256 KiB) and saving the session URL and the next byte after every chunk.
 * With `resume`, it first asks YouTube how much it has (PUT bytes * /total):
 * a session that already finished returns its video (no second post), a dead
 * one (404, 410 or older than 6 days) starts again from zero, which is safe
 * because YouTube only creates the video when the last byte arrives. When the
 * deadline comes, it returns « pending » with `resume` and the next run
 * continues. Never throws; the token never appears in a result.
 */
export async function publishYouTubeShort(
  deps: YouTubePublishDeps,
  token: string,
  input: ShortInput,
  opts: { resume?: YouTubeResume | null } = {},
): Promise<YouTubeNetworkResult> {
  const clock = deps.clock ?? (() => Date.now());
  const timeLeft = () => (deps.deadline == null ? Infinity : deps.deadline - clock());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const chunk = Math.max(CHUNK_UNIT, Math.floor((deps.chunkSize ?? DEFAULT_CHUNK_SIZE) / CHUNK_UNIT) * CHUNK_UNIT);
  const auth = { Authorization: `Bearer ${token}` };
  const done = ({ id: videoId, status }: Answered): YouTubeNetworkResult => ({
    status: "published",
    remote_id: videoId,
    permalink: shortsUrl(videoId),
    published_at: new Date(clock()).toISOString(),
    note: privacyNote(input, status),
    resume: null,
    retry_after: null,
  });
  const fail = (status: number | undefined, body: unknown, resume: YouTubeResume | null): YouTubeNetworkResult => {
    const { error, reason } = frenchUploadError(status ?? 0, body);
    if (isQuotaReason(reason)) return { status: "failed", error: QUOTA_ERROR, resume, retry_after: nextQuotaReset(new Date(clock())) };
    return { status: "failed", error, resume };
  };

  let resume = opts.resume && Date.parse(opts.resume.expires_at) > clock() ? { ...opts.resume } : null;

  // Probe: how much of an earlier session arrived?
  const probe = async (r: YouTubeResume): Promise<"gone" | "unknown" | { id: Answered } | { next: number } | { failed: YouTubeNetworkResult }> => {
    try {
      const res = await deps.fetch(r.session_url, { method: "PUT", headers: { ...auth, "Content-Range": `bytes */${r.total}` } });
      if (res.status === 200 || res.status === 201) {
        const id = await idOf(res);
        return id ? { id } : "unknown";
      }
      if (res.status === 308) return { next: lastByteOf(res.headers.get("range")) + 1 };
      if (res.status === 404 || res.status === 410) return "gone";
      if (res.status >= 500 || res.status === 429) return "unknown";
      return { failed: fail(res.status, await res.json().catch(() => null), r) };
    } catch {
      return "unknown";
    }
  };

  try {
    if (resume) {
      const p = await probe(resume);
      if (p === "gone") resume = null;
      else if (p !== "unknown") {
        if ("id" in p) return done(p.id);
        if ("failed" in p) return p.failed;
        resume = { ...resume, next_byte: p.next };
      }
    }

    if (!resume) {
      const total = await deps.video.size();
      if (!total) return { status: "failed", error: "Le fichier vidéo est vide." };
      const session = await startResumableSession(token, buildShortMetadata(input), { size: total, contentType: deps.contentType }, deps.fetch);
      if (!session.ok) {
        if (isQuotaReason(session.reason)) return { status: "failed", error: QUOTA_ERROR, resume: null, retry_after: nextQuotaReset(new Date(clock())) };
        return { status: "failed", error: session.error, resume: null };
      }
      resume = { session_url: session.sessionUrl, next_byte: 0, total, expires_at: new Date(clock() + SESSION_TTL_MS).toISOString() };
      await deps.onProgress?.({ status: "pending", resume });
    }

    let retries = 0;
    while (resume.next_byte < resume.total) {
      if (timeLeft() < YOUTUBE_CHUNK_TIME_MARGIN_MS) {
        return { status: "pending", resume, error: "Envoi vers YouTube en cours : il reprend au prochain passage." };
      }
      const start = resume.next_byte;
      const end = Math.min(start + chunk, resume.total) - 1;
      let res: Awaited<ReturnType<UploadFetch>> | null = null;
      try {
        const bytes = await deps.video.readRange(start, end);
        if (bytes.byteLength !== end - start + 1) throw new Error("ROOGO:La vidéo n'a pas pu être lue en entier depuis le stockage.");
        res = await deps.fetch(resume.session_url, {
          method: "PUT",
          headers: { ...auth, "Content-Type": deps.contentType, "Content-Range": `bytes ${start}-${end}/${resume.total}` },
          body: bytes,
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("ROOGO:")) {
          return { status: "failed", error: error.message.slice(6), resume };
        }
        res = null;
      }

      if (res && (res.status === 200 || res.status === 201)) {
        const id = await idOf(res);
        if (!id) return { status: "failed", error: "YouTube a reçu la vidéo sans renvoyer son identifiant.", resume: null };
        return done(id);
      }
      if (res && res.status === 308) {
        const next = lastByteOf(res.headers.get("range")) + 1;
        resume = { ...resume, next_byte: next };
        retries = 0;
        await deps.onProgress?.({ status: "pending", resume });
        continue;
      }
      if (res && (res.status === 404 || res.status === 410)) {
        // Nothing was posted (the video exists only once the last byte arrives): « Réessayer » starts again.
        return { status: "failed", error: "La session de mise en ligne YouTube a expiré. Réessayez.", resume: null };
      }
      if (res && res.status < 500 && res.status !== 429 && res.status !== 408) {
        // 401: keep the position, the next token continues the same session.
        return fail(res.status, await res.json().catch(() => null), res.status === 401 ? resume : null);
      }

      // Network error, 5xx, 408 or 429: ask YouTube how much it has, then resume.
      retries += 1;
      if (retries > MAX_RETRIES) {
        return { status: "failed", error: `La mise en ligne YouTube a échoué après ${MAX_RETRIES} reprises${res ? ` (HTTP ${res.status})` : ""}. « Réessayer » reprend où elle s'est arrêtée.`, resume };
      }
      await sleep(1000 * 2 ** retries);
      const p = await probe(resume);
      if (p === "gone") return { status: "failed", error: "La session de mise en ligne YouTube a expiré. Réessayez.", resume: null };
      if (p !== "unknown") {
        if ("id" in p) return done(p.id);
        if ("failed" in p) return p.failed;
        resume = { ...resume, next_byte: p.next };
      }
    }
    // Every byte confirmed by a 308 but no final answer: ask once more.
    const p = await probe(resume);
    if (p !== "gone" && p !== "unknown" && "id" in p) return done(p.id);
    return { status: "pending", resume, error: "YouTube termine la réception de la vidéo. Elle reprend au prochain passage." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", error: message.startsWith("ROOGO:") ? message.slice(6) : "La mise en ligne YouTube a échoué. Réessayez.", resume };
  }
}
