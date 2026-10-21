// TikTok publishing for the Studio calendar, through TikTok's Content Posting
// API only (https://developers.tiktok.com/doc/content-posting-api-get-started):
//
// - Direct Post (scope video.publish): POST /v2/post/publish/video/init/ with
//   privacy_level SELF_ONLY. TikTok keeps every post of an unaudited app
//   private (visible by the account only) until the app passes TikTok's audit.
// - Upload to drafts (scope video.upload): POST /v2/post/publish/inbox/video/init/.
//   The video lands in the TikTok app's notifications, the account owner
//   finishes and publishes it there. Chosen with TIKTOK_POST_MODE=draft.
//
// Both use source FILE_UPLOAD (we PUT the bytes ourselves), never
// PULL_FROM_URL: that one needs a domain verified with TikTok and our media
// lives on Supabase signed URLs.
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
/** TikTok: one chunk up to 64 MB; otherwise chunks of 5 to 64 MB, the last one may hold the remainder (up to 128 MB). */
export const SINGLE_CHUNK_MAX = 64 * MB;
export const CHUNK_SIZE = 10 * MB;
export const MAX_VIDEO_BYTES = 4 * 1024 * MB;

export type ChunkPlan = { videoSize: number; chunkSize: number; totalChunkCount: number; ranges: Array<{ start: number; end: number }> };

/** The upload plan TikTok expects. Byte ranges are inclusive. */
export function chunkPlan(videoSize: number): ChunkPlan {
  if (!Number.isInteger(videoSize) || videoSize <= 0) throw new Error("ROOGO:La vidéo est vide.");
  if (videoSize > MAX_VIDEO_BYTES) throw new Error("ROOGO:La vidéo dépasse la taille acceptée par TikTok.");
  if (videoSize <= SINGLE_CHUNK_MAX) return { videoSize, chunkSize: videoSize, totalChunkCount: 1, ranges: [{ start: 0, end: videoSize - 1 }] };
  const total = Math.floor(videoSize / CHUNK_SIZE);
  const ranges = Array.from({ length: total }, (_, i) => ({ start: i * CHUNK_SIZE, end: i === total - 1 ? videoSize - 1 : (i + 1) * CHUNK_SIZE - 1 }));
  return { videoSize, chunkSize: CHUNK_SIZE, totalChunkCount: total, ranges };
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

export type TikTokPublishDeps = {
  fetch: TikTokFetch;
  sleep: (ms: number) => Promise<void>;
  /** The video bytes (downloaded from our storage). */
  loadVideo: () => Promise<Uint8Array>;
  now?: () => string;
  pollIntervalMs?: number;
  maxPolls?: number;
  /** Saves the publish_id before waiting, so a retry checks it instead of posting twice. */
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

/**
 * Publishes one video to TikTok. With `existingPublishId` (saved by an earlier
 * run that timed out) it only checks that upload, never posts again. Never
 * throws: a failure comes back as a French error.
 */
export async function publishTikTok(
  deps: TikTokPublishDeps,
  token: string,
  caption: string,
  opts: { mode: TikTokPostMode; existingPublishId?: string | null },
): Promise<TikTokNetworkResult> {
  let publishId = opts.existingPublishId ?? null;
  // Only an upload TikTok fully received is worth checking again on a retry.
  let uploaded = Boolean(publishId);
  const note = opts.mode === "direct" ? "Publiée en privé (visible par le compte seulement)" : "Dans les brouillons TikTok, à publier depuis l'application";
  try {
    if (!publishId) {
      const bytes = await deps.loadVideo();
      const plan = chunkPlan(bytes.byteLength);
      const source_info = { source: "FILE_UPLOAD", video_size: plan.videoSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount };
      const init =
        opts.mode === "direct"
          ? await tiktokJson(deps.fetch, token, "/v2/post/publish/video/init/", {
              post_info: { title: tiktokTitle(caption), privacy_level: "SELF_ONLY", disable_duet: false, disable_comment: false, disable_stitch: false },
              source_info,
            })
          : await tiktokJson(deps.fetch, token, "/v2/post/publish/inbox/video/init/", { source_info });
      publishId = typeof init.publish_id === "string" ? init.publish_id : null;
      const uploadUrl = typeof init.upload_url === "string" ? init.upload_url : null;
      if (!publishId || !uploadUrl) throw new Error("ROOGO:TikTok n'a pas ouvert l'envoi de la vidéo.");
      await deps.onProgress?.({ status: "pending", container_id: publishId });
      for (const range of plan.ranges) {
        const chunk = bytes.subarray(range.start, range.end + 1);
        const res = await deps.fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(chunk.byteLength),
            "Content-Range": `bytes ${range.start}-${range.end}/${plan.videoSize}`,
          },
          body: chunk,
        });
        if (!res.ok) throw new TikTokApiError(`upload_http_${res.status}`, res.status, "L'envoi de la vidéo à TikTok a échoué.");
      }
      uploaded = true;
    }

    const maxPolls = deps.maxPolls ?? 12;
    for (let i = 0; i < maxPolls; i += 1) {
      const s = await fetchPublishStatus(deps.fetch, token, publishId);
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
      await deps.sleep(deps.pollIntervalMs ?? 5000);
    }
    return { status: "pending", container_id: publishId, error: "TikTok traite encore la vidéo. Réessayez dans quelques minutes." };
  } catch (error) {
    return { status: "failed", container_id: uploaded ? publishId : null, error: frenchTikTokError(error) };
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
  if (!input.connected) return off("Le compte TikTok n'est pas connecté (Nos objectifs, Connecter TikTok).");
  const scope = requiredScope(input.mode);
  if (!hasScope(input.scope, scope)) return off(`Reconnectez TikTok en autorisant la publication (${scope}).`);
  return { enabled: true, mode: input.mode, reason: null, note };
}
