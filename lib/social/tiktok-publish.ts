// TikTok publishing for the Studio calendar, through TikTok's Content Posting
// API only (https://developers.tiktok.com/doc/content-posting-api-get-started):
//
// - Direct Post (scope video.publish): POST /v2/post/publish/video/init/ with
//   exactly the privacy, interactions and commercial disclosure Salif chose
//   on the approval screen (lib/social/tiktok-post-settings.ts, 2026-10-31).
//   TikTok keeps every post of an unaudited app private until it is audited.
// - Upload to drafts (scope video.upload): POST /v2/post/publish/inbox/video/init/.
//   The video lands in the TikTok app's notifications, the account owner
//   finishes and publishes it there. Chosen with TIKTOK_POST_MODE=draft.
//
// Source: FILE_UPLOAD by default, in 10 MB chunks read one at a time with
// Range requests (never the whole file in memory), resumable across runs.
// PULL_FROM_URL only when TIKTOK_PULL_URL_PREFIX names a URL prefix verified
// in the TikTok developer portal (TikTok then downloads the signed link).
//
// No runtime imports: node:test loads this file directly with a fake fetch
// (lib/social/tiktok-publish.test.mjs). The access token travels only in the
// Authorization header and never reaches a message or a log.

export const TIKTOK_API = "https://open.tiktokapis.com";
export const TIKTOK_PRIVATE_NOTE = "TikTok : publication privée tant que l'application n'est pas validée par TikTok";
export const TIKTOK_DRAFT_NOTE = "TikTok : la vidéo arrive dans les brouillons du compte, à publier depuis l'application TikTok";

export type TikTokPostMode = "direct" | "draft";

export function tiktokPostMode(env: Record<string, string | undefined>): TikTokPostMode {
  return env.TIKTOK_POST_MODE?.trim().toLowerCase() === "draft" ? "draft" : "direct";
}

/** The scope each mode needs on the stored token. */
export function requiredScope(mode: TikTokPostMode): "video.publish" | "video.upload" {
  return mode === "direct" ? "video.publish" : "video.upload";
}

export function hasScope(scope: string | null | undefined, needed: string): boolean {
  return (scope ?? "").split(/[,\s]+/).includes(needed);
}

// --- Chunks -------------------------------------------------------------------

const MB = 1024 * 1024;
/**
 * TikTok's rules: a video under 5 MB goes in one chunk; otherwise every chunk
 * is 5 to 64 MB, total_chunk_count = floor(video_size / chunk_size), and the
 * last chunk carries the remainder (up to 128 MB). We use 10 MB chunks from
 * 20 MB, so a function never holds more than one chunk (under 20 MB) in
 * memory, whatever the video size (« Publier une vidéo » allows 500 MB).
 *
 * Under 20 MB the video goes whole, with chunk_size = video_size: with 10 MB
 * chunks, floor() would give one chunk smaller than the file, and TikTok
 * answers « invalid_params: The chunk size is invalid » (a 17 MB video on
 * 2026-10-30). A single chunk must be the whole file.
 */
export const CHUNK_SIZE = 10 * MB;
/** Largest video sent as one chunk: below two chunks, floor() would give one chunk smaller than the file. */
export const SINGLE_CHUNK_MAX = 2 * CHUNK_SIZE - 1;
export const MAX_VIDEO_BYTES = 4 * 1024 * MB;
/** TikTok's upload_url is valid one hour; we resume within 55 minutes, else start a new upload. */
export const UPLOAD_URL_TTL_MS = 55 * 60_000;
/** Do not start a chunk when less than this is left before the function's deadline. */
export const CHUNK_TIME_MARGIN_MS = 30_000;
/** Attempts per chunk (the range is read again from storage each time). */
export const CHUNK_ATTEMPTS = 3;

export type ChunkPlan = { videoSize: number; chunkSize: number; totalChunkCount: number; ranges: Array<{ start: number; end: number }> };

/** The byte range (inclusive) of chunk `index`; the last one takes the remainder. */
export function chunkRange(index: number, videoSize: number, chunkSize: number, totalChunkCount: number): { start: number; end: number } {
  const start = index * chunkSize;
  const end = index === totalChunkCount - 1 ? videoSize - 1 : (index + 1) * chunkSize - 1;
  return { start, end };
}

/** The upload plan TikTok expects. Byte ranges are inclusive. */
export function chunkPlan(videoSize: number): ChunkPlan {
  if (!Number.isInteger(videoSize) || videoSize <= 0) throw new Error("ROOGO:La vidéo est vide.");
  if (videoSize > MAX_VIDEO_BYTES) throw new Error("ROOGO:La vidéo dépasse la taille acceptée par TikTok.");
  if (videoSize <= SINGLE_CHUNK_MAX) return { videoSize, chunkSize: videoSize, totalChunkCount: 1, ranges: [{ start: 0, end: videoSize - 1 }] };
  const total = Math.floor(videoSize / CHUNK_SIZE);
  const ranges = Array.from({ length: total }, (_, i) => chunkRange(i, videoSize, CHUNK_SIZE, total));
  return { videoSize, chunkSize: CHUNK_SIZE, totalChunkCount: total, ranges };
}

/**
 * PULL_FROM_URL is only allowed for URL prefixes verified in the TikTok
 * developer portal. TIKTOK_PULL_URL_PREFIX names the verified prefix; a video
 * URL under it is pulled by TikTok (nothing passes through our function),
 * anything else goes by FILE_UPLOAD in chunks.
 */
export function pullUrlAllowed(videoUrl: string, verifiedPrefix: string | null | undefined): boolean {
  const prefix = (verifiedPrefix ?? "").trim();
  return Boolean(prefix) && /^https:\/\//.test(prefix) && videoUrl.startsWith(prefix);
}

/** TikTok counts the title in UTF-16 code units, at most 2 200. */
export function tiktokTitle(text: string): string {
  const flat = (text ?? "").trim();
  return flat.length > 2200 ? flat.slice(0, 2200) : flat;
}

// --- Errors -------------------------------------------------------------------

export class TikTokApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "TikTokApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** French text for the publication card. Never includes a token. */
export function frenchTikTokError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("ROOGO:")) return error.message.slice(6);
  if (error instanceof TikTokApiError) {
    switch (error.code) {
      case "access_token_invalid":
      case "token_not_authorized_for_specified_open_id":
        return "Le jeton TikTok a expiré ou a été révoqué : reconnectez TikTok.";
      case "scope_not_authorized":
        return "TikTok n'a pas donné la permission de publier : reconnectez TikTok en autorisant la publication.";
      case "unaudited_client_can_only_post_to_private_accounts":
        return "TikTok refuse : tant que l'application n'est pas validée par TikTok, elle ne publie qu'en privé.";
      case "spam_risk_too_many_posts":
      case "spam_risk_user_banned_from_posting":
      case "reached_active_user_cap":
      case "rate_limit_exceeded":
        return "TikTok limite les publications pour le moment. Réessayez plus tard.";
      case "privacy_level_option_mismatch":
        return "TikTok refuse ce niveau de confidentialité pour ce compte.";
      case "file_format_check_failed":
      case "video_pull_failed":
        return "TikTok n'a pas accepté le fichier vidéo (format ou taille).";
      case "duration_check_failed":
        return "La vidéo est trop longue pour ce compte TikTok.";
      default:
        if (error.httpStatus >= 500) return "TikTok est indisponible pour le moment. Réessayez.";
        return `Erreur TikTok (${error.code}) : ${error.message.replace(/https?:\/\/\S+/g, "[lien]").slice(0, 140) || "réponse inattendue"}`;
    }
  }
  return "La connexion à TikTok a échoué. Réessayez.";
}

// --- Calls --------------------------------------------------------------------

export type TikTokFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string | Uint8Array },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

type Json = Record<string, unknown>;

async function tiktokJson(fetchImpl: TikTokFetch, token: string, path: string, body: Json): Promise<Json> {
  const res = await fetchImpl(`${TIKTOK_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  let data: Json = {};
  try {
    data = ((await res.json()) ?? {}) as Json;
  } catch {
    data = {};
  }
  const err = (data.error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof err.code === "string" ? err.code : res.ok ? "ok" : `http_${res.status}`;
  if (!res.ok || code !== "ok") {
    throw new TikTokApiError(code, res.status, typeof err.message === "string" ? err.message : `HTTP ${res.status}`);
  }
  return (data.data ?? {}) as Json;
}

/** Where an interrupted FILE_UPLOAD continues (saved in the results, never shown to the team). */
export type TikTokResume = {
  upload_url: string;
  next_chunk: number;
  video_size: number;
  chunk_size: number;
  total_chunk_count: number;
  /** After this, TikTok's upload_url is dead: start a new upload. */
  expires_at: string;
};

export type TikTokVideoSource = {
  /** Public, short-lived signed URL of the video (Range supported). */
  url: string;
  /** Total size in bytes (asked from storage when unknown). */
  size: () => Promise<number>;
  /** Bytes start..end inclusive, read with a Range request: never the whole file. */
  readRange: (start: number, end: number) => Promise<Uint8Array>;
};

export type TikTokPublishDeps = {
  fetch: TikTokFetch;
  sleep: (ms: number) => Promise<void>;
  video: TikTokVideoSource;
  now?: () => string;
  /** Epoch ms: no chunk starts and no status wait begins past this minus the margin. */
  deadline?: number;
  clock?: () => number;
  /** TIKTOK_PULL_URL_PREFIX: verified URL prefix for PULL_FROM_URL. */
  pullUrlPrefix?: string | null;
  pollIntervalMs?: number;
  maxPolls?: number;
  /** Saves the publish_id (and the upload position) before waiting, so a retry never posts twice. */
  onProgress?: (partial: TikTokNetworkResult) => Promise<void> | void;
};

/** Same shape as NetworkResult in lib/studio/publishing.ts (kept import-free for tests). */
export type TikTokNetworkResult = {
  status: "published" | "failed" | "pending";
  remote_id?: string | null;
  permalink?: string | null;
  container_id?: string | null;
  error?: string | null;
  published_at?: string | null;
  note?: string | null;
  /** Set while a chunked upload is unfinished: the next run continues from here. */
  resume?: TikTokResume | null;
};

export type PublishStatus = "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED" | "UNKNOWN";

export async function fetchPublishStatus(fetchImpl: TikTokFetch, token: string, publishId: string): Promise<{ status: PublishStatus; failReason: string | null; postId: string | null }> {
  const data = await tiktokJson(fetchImpl, token, "/v2/post/publish/status/fetch/", { publish_id: publishId });
  const status = (typeof data.status === "string" ? data.status : "UNKNOWN") as PublishStatus;
  const ids = Array.isArray(data.publicaly_available_post_id) ? data.publicaly_available_post_id : [];
  return {
    status,
    failReason: typeof data.fail_reason === "string" ? data.fail_reason : null,
    postId: ids.length ? String(ids[0]) : null,
  };
}

async function putChunk(deps: TikTokPublishDeps, resume: TikTokResume, index: number): Promise<void> {
  const { start, end } = chunkRange(index, resume.video_size, resume.chunk_size, resume.total_chunk_count);
  let lastStatus = 0;
  for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt += 1) {
    try {
      // Read the range again on each attempt: only this chunk is ever in memory.
      const chunk = await deps.video.readRange(start, end);
      if (chunk.byteLength !== end - start + 1) throw new Error("ROOGO:La vidéo n'a pas pu être lue en entier depuis le stockage.");
      const res = await deps.fetch(resume.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${start}-${end}/${resume.video_size}`,
        },
        body: chunk,
      });
      if (res.ok) return;
      lastStatus = res.status;
      // 4xx other than timeout or rate limit will not get better by retrying.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
    } catch (error) {
      if (attempt === CHUNK_ATTEMPTS) throw error;
    }
    if (attempt < CHUNK_ATTEMPTS) await deps.sleep(1000 * 2 ** attempt);
  }
  throw new TikTokApiError(`upload_http_${lastStatus}`, lastStatus, "L'envoi de la vidéo à TikTok a échoué.");
}

/**
 * Publishes one video to TikTok without ever holding the whole file:
 * PULL_FROM_URL when the signed URL is under a verified prefix (TikTok
 * downloads it), otherwise FILE_UPLOAD in 10 MB chunks read one by one with
 * Range requests. When the function's deadline comes before the last chunk,
 * it returns « pending » with `resume` and the next run continues (TikTok's
 * upload_url lasts one hour). With `existingPublishId` and no `resume`, an
 * earlier upload is only checked, never posted again. Never throws.
 */
export async function publishTikTok(
  deps: TikTokPublishDeps,
  token: string,
  caption: string,
  opts: {
    mode: TikTokPostMode;
    existingPublishId?: string | null;
    resume?: TikTokResume | null;
    /** Direct mode: the post_info fields saved at approval (postInfoFields). Required to start a direct upload. */
    postInfo?: {
      privacy_level: string;
      disable_comment: boolean;
      disable_duet: boolean;
      disable_stitch: boolean;
      brand_content_toggle: boolean;
      brand_organic_toggle: boolean;
    } | null;
  },
): Promise<TikTokNetworkResult> {
  const clock = deps.clock ?? (() => Date.now());
  const timeLeft = () => (deps.deadline == null ? Infinity : deps.deadline - clock());
  let publishId = opts.existingPublishId ?? null;
  let resume = opts.resume && publishId && Date.parse(opts.resume.expires_at) > clock() ? opts.resume : null;
  // A resume whose upload_url expired: that upload never completed, so nothing was posted. Start again.
  if (opts.resume && !resume) publishId = null;
  // Only an upload TikTok fully received is worth checking again on a retry.
  let uploaded = Boolean(publishId) && !resume;
  const note =
    opts.mode === "draft"
      ? "Dans les brouillons TikTok, à publier depuis l'application"
      : opts.postInfo?.privacy_level === "SELF_ONLY"
        ? "Publiée en privé (visible par le compte seulement)"
        : "Publiée sur TikTok";
  try {
    if (!publishId && opts.mode === "direct" && !opts.postInfo) {
      return { status: "failed", container_id: null, error: "Réglages TikTok manquants : « Annuler » la validation puis valider à nouveau en remplissant le panneau TikTok." };
    }
    if (!publishId) {
      const pull = pullUrlAllowed(deps.video.url, deps.pullUrlPrefix);
      let source_info: Json;
      let plan: ChunkPlan | null = null;
      if (pull) {
        source_info = { source: "PULL_FROM_URL", video_url: deps.video.url };
      } else {
        plan = chunkPlan(await deps.video.size());
        source_info = { source: "FILE_UPLOAD", video_size: plan.videoSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount };
      }
      const init =
        opts.mode === "direct"
          ? await tiktokJson(deps.fetch, token, "/v2/post/publish/video/init/", {
              post_info: { title: tiktokTitle(caption), ...opts.postInfo },
              source_info,
            })
          : await tiktokJson(deps.fetch, token, "/v2/post/publish/inbox/video/init/", { source_info });
      publishId = typeof init.publish_id === "string" ? init.publish_id : null;
      if (!publishId) throw new Error("ROOGO:TikTok n'a pas ouvert l'envoi de la vidéo.");
      if (pull) {
        uploaded = true;
        await deps.onProgress?.({ status: "pending", container_id: publishId });
      } else {
        const uploadUrl = typeof init.upload_url === "string" ? init.upload_url : null;
        if (!uploadUrl) throw new Error("ROOGO:TikTok n'a pas ouvert l'envoi de la vidéo.");
        resume = {
          upload_url: uploadUrl,
          next_chunk: 0,
          video_size: plan!.videoSize,
          chunk_size: plan!.chunkSize,
          total_chunk_count: plan!.totalChunkCount,
          expires_at: new Date(clock() + UPLOAD_URL_TTL_MS).toISOString(),
        };
        await deps.onProgress?.({ status: "pending", container_id: publishId, resume });
      }
    }

    if (resume) {
      for (let i = resume.next_chunk; i < resume.total_chunk_count; i += 1) {
        if (timeLeft() < CHUNK_TIME_MARGIN_MS) {
          resume = { ...resume, next_chunk: i };
          return { status: "pending", container_id: publishId, resume, error: "Envoi vers TikTok en cours : il reprend au prochain passage." };
        }
        await putChunk(deps, resume, i);
        resume = { ...resume, next_chunk: i + 1 };
        if (i + 1 < resume.total_chunk_count) await deps.onProgress?.({ status: "pending", container_id: publishId, resume });
      }
      resume = null;
      uploaded = true;
      await deps.onProgress?.({ status: "pending", container_id: publishId, resume: null });
    }

    const maxPolls = deps.maxPolls ?? 12;
    for (let i = 0; i < maxPolls; i += 1) {
      const s = await fetchPublishStatus(deps.fetch, token, publishId!);
      if (s.status === "FAILED") {
        return { status: "failed", container_id: null, error: frenchTikTokError(new TikTokApiError(s.failReason ?? "failed", 200, s.failReason ?? "")) };
      }
      const done = opts.mode === "direct" ? s.status === "PUBLISH_COMPLETE" : s.status === "SEND_TO_USER_INBOX" || s.status === "PUBLISH_COMPLETE";
      if (done) {
        return {
          status: "published",
          container_id: publishId,
          remote_id: s.postId ?? publishId,
          permalink: null,
          published_at: deps.now ? deps.now() : new Date().toISOString(),
          note,
        };
      }
      if (timeLeft() < CHUNK_TIME_MARGIN_MS) break;
      await deps.sleep(deps.pollIntervalMs ?? 5000);
    }
    return { status: "pending", container_id: publishId, error: "TikTok traite encore la vidéo. Réessayez dans quelques minutes." };
  } catch (error) {
    // A half-sent upload keeps its position, so « Réessayer » continues it within the hour.
    return { status: "failed", container_id: uploaded || resume ? publishId : null, resume: uploaded ? null : resume, error: frenchTikTokError(error) };
  }
}

// --- Availability -----------------------------------------------------------

export type TikTokPublishInfo = {
  /** True when a validated video may target TikTok. */
  enabled: boolean;
  mode: TikTokPostMode;
  /** French reason when not enabled. */
  reason: string | null;
  /** The note shown next to the TikTok choice. */
  note: string;
};

/**
 * Whether TikTok publishing is on. Feature flag: TIKTOK_CLIENT_KEY set, the
 * social_tokens row (migration 100, PR #78) present with a publishing scope.
 */
export function tiktokPublishInfo(input: {
  clientKey: boolean;
  tokensKey: boolean;
  tableReady: boolean;
  connected: boolean;
  scope: string | null;
  mode: TikTokPostMode;
}): TikTokPublishInfo {
  const note = input.mode === "direct" ? TIKTOK_PRIVATE_NOTE : TIKTOK_DRAFT_NOTE;
  const off = (reason: string): TikTokPublishInfo => ({ enabled: false, mode: input.mode, reason, note });
  if (!input.clientKey) return off("TikTok n'est pas configuré sur le serveur (TIKTOK_CLIENT_KEY).");
  if (!input.tokensKey) return off("TikTok n'est pas configuré sur le serveur (SOCIAL_TOKENS_KEY).");
  if (!input.tableReady) return off("La connexion TikTok n'est pas encore installée (migration 100 à lancer).");
  if (!input.connected) return off("Le compte TikTok n'est pas connecté (Studio, Statistiques, Connecter TikTok).");
  const scope = requiredScope(input.mode);
  if (!hasScope(input.scope, scope)) return off(`Reconnectez TikTok en autorisant la publication (${scope}).`);
  return { enabled: true, mode: input.mode, reason: null, note };
}
