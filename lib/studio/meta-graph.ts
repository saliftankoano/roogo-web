// Meta Graph API publishing for the Studio calendar: Facebook Page (Reels,
// photo, multi-photo, text, comment) and Instagram (Reels, image, carousel).
//
// Pure where it can be: every request is built by a small function, and the
// publishers take `fetch` and `sleep` as arguments, so tests run with a fake
// fetch and never touch the network. No secret is ever logged; error texts are
// rebuilt from Meta's code and message, never from the request.
//
// Docs checked 2026-10-12 (examples on v25.0):
//   developers.facebook.com/docs/video-api/guides/reels-publishing
//   developers.facebook.com/docs/instagram-platform/content-publishing

import type { NetworkResult } from "./publishing";

export const DEFAULT_GRAPH_VERSION = "v25.0";
const GRAPH_HOST = "https://graph.facebook.com";
const RUPLOAD_HOST = "https://rupload.facebook.com";

export type MetaConfig = {
  graphVersion: string;
  pageId: string;
  igUserId: string;
  /**
   * The token sent to Meta. With META_GRAPH_TOKEN (system user token) it is
   * that token, and Facebook calls first swap it for the Page token
   * (`withPageToken`). With the legacy META_PAGE_ACCESS_TOKEN it is already a
   * Page token.
   */
  pageToken: string;
  /** True when pageToken is the system user token, not yet a Page token. */
  needsPageToken?: boolean;
};

export type GraphRequest = {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
};

/**
 * Reads the Meta settings from the environment. Returns what is missing instead of throwing.
 *
 * Same variables as the nightly follower readings (lib/team-goals/meta-followers.ts):
 * META_GRAPH_TOKEN (system user token with the publish permissions), META_PAGE_ID,
 * META_IG_ACCOUNT_ID. The first names of this branch (META_PAGE_ACCESS_TOKEN,
 * META_IG_USER_ID) still work as fallbacks so nothing breaks if they were set.
 */
export function metaConfigFromEnv(env: Record<string, string | undefined>): {
  config: MetaConfig | null;
  facebook: boolean;
  instagram: boolean;
  missing: string[];
} {
  const systemToken = env.META_GRAPH_TOKEN?.trim() ?? "";
  const legacyPageToken = env.META_PAGE_ACCESS_TOKEN?.trim() ?? "";
  const pageToken = systemToken || legacyPageToken;
  const pageId = env.META_PAGE_ID?.trim() ?? "";
  const igUserId = env.META_IG_ACCOUNT_ID?.trim() || env.META_IG_USER_ID?.trim() || "";
  const graphVersion = /^v\d+\.\d+$/.test(env.META_GRAPH_VERSION?.trim() ?? "") ? env.META_GRAPH_VERSION!.trim() : DEFAULT_GRAPH_VERSION;
  const missing = [
    !pageToken ? "META_GRAPH_TOKEN" : null,
    !pageId ? "META_PAGE_ID" : null,
    !igUserId ? "META_IG_ACCOUNT_ID" : null,
  ].filter((v): v is string => Boolean(v));
  const facebook = Boolean(pageToken && pageId);
  const instagram = Boolean(pageToken && igUserId);
  return {
    config: facebook || instagram ? { graphVersion, pageId, igUserId, pageToken, needsPageToken: Boolean(systemToken) } : null,
    facebook,
    instagram,
    missing,
  };
}

function graphUrl(cfg: MetaConfig, path: string, query: Record<string, string> = {}): string {
  const qs = new URLSearchParams(query).toString();
  return `${GRAPH_HOST}/${cfg.graphVersion}/${path}${qs ? `?${qs}` : ""}`;
}

function post(cfg: MetaConfig, path: string, params: Record<string, string>): GraphRequest {
  return {
    method: "POST",
    url: graphUrl(cfg, path),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: cfg.pageToken }).toString(),
  };
}

function get(cfg: MetaConfig, path: string, fields: string): GraphRequest {
  return { method: "GET", url: graphUrl(cfg, path, { fields, access_token: cfg.pageToken }), headers: {} };
}

// --- Facebook Page -----------------------------------------------------------

export const fb = {
  /** One photo, published now, with the caption as the post text. */
  photo: (cfg: MetaConfig, imageUrl: string, message: string) =>
    post(cfg, `${cfg.pageId}/photos`, { url: imageUrl, message, published: "true" }),
  /** A photo uploaded unpublished, to attach to a multi-photo post. */
  unpublishedPhoto: (cfg: MetaConfig, imageUrl: string) =>
    post(cfg, `${cfg.pageId}/photos`, { url: imageUrl, published: "false" }),
  multiPhotoPost: (cfg: MetaConfig, message: string, mediaIds: string[]) => {
    const params: Record<string, string> = { message };
    mediaIds.forEach((id, i) => {
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
    });
    return post(cfg, `${cfg.pageId}/feed`, params);
  },
  textPost: (cfg: MetaConfig, message: string) => post(cfg, `${cfg.pageId}/feed`, { message }),
  comment: (cfg: MetaConfig, objectId: string, message: string) => post(cfg, `${objectId}/comments`, { message }),
  reelStart: (cfg: MetaConfig) => post(cfg, `${cfg.pageId}/video_reels`, { upload_phase: "start" }),
  /** A regular Page video (Meta fetches `fileUrl`): for videos over the 90 s Reels limit. */
  videoPost: (cfg: MetaConfig, fileUrl: string, description: string) => post(cfg, `${cfg.pageId}/videos`, { file_url: fileUrl, description }),
  /** Meta fetches the file itself from `fileUrl` (our signed URL). */
  reelUpload: (cfg: MetaConfig, videoId: string, fileUrl: string): GraphRequest => ({
    method: "POST",
    url: `${RUPLOAD_HOST}/video-upload/${cfg.graphVersion}/${videoId}`,
    headers: { Authorization: `OAuth ${cfg.pageToken}`, file_url: fileUrl },
  }),
  reelStatus: (cfg: MetaConfig, videoId: string) => get(cfg, videoId, "status"),
  reelFinish: (cfg: MetaConfig, videoId: string, description: string) =>
    post(cfg, `${cfg.pageId}/video_reels`, {
      upload_phase: "finish",
      video_id: videoId,
      video_state: "PUBLISHED",
      description,
    }),
  permalink: (cfg: MetaConfig, objectId: string) => get(cfg, objectId, "permalink_url"),
};

// --- Instagram ---------------------------------------------------------------

export const ig = {
  image: (cfg: MetaConfig, imageUrl: string, caption: string) =>
    post(cfg, `${cfg.igUserId}/media`, { image_url: imageUrl, caption }),
  carouselItem: (cfg: MetaConfig, imageUrl: string) =>
    post(cfg, `${cfg.igUserId}/media`, { image_url: imageUrl, is_carousel_item: "true" }),
  carousel: (cfg: MetaConfig, children: string[], caption: string) =>
    post(cfg, `${cfg.igUserId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption }),
  reel: (cfg: MetaConfig, videoUrl: string, caption: string) =>
    post(cfg, `${cfg.igUserId}/media`, { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: "true" }),
  status: (cfg: MetaConfig, containerId: string) => get(cfg, containerId, "status_code"),
  publish: (cfg: MetaConfig, containerId: string) => post(cfg, `${cfg.igUserId}/media_publish`, { creation_id: containerId }),
  permalink: (cfg: MetaConfig, mediaId: string) => get(cfg, mediaId, "permalink"),
};

// --- Errors ------------------------------------------------------------------

export class MetaError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;
  readonly httpStatus: number;

  constructor(code: number | null, subcode: number | null, httpStatus: number, message: string) {
    super(message);
    this.name = "MetaError";
    this.code = code;
    this.subcode = subcode;
    this.httpStatus = httpStatus;
  }
}

/** Short, readable French text for the card. Never includes a token or a URL. */
export function frenchMetaError(error: unknown): string {
  if (error instanceof MetaError) {
    const code = error.code;
    const sub = error.subcode;
    const detail = error.message.replace(/https?:\/\/\S+/g, "[lien]").replace(/access_token=\S+/g, "").slice(0, 160);
    if (code === 190) return "Le jeton Meta a expiré ou a été révoqué. Il faut générer un nouveau jeton (voir le guide).";
    if (code === 10 || code === 200 || (code !== null && code >= 200 && code < 300)) {
      return `Permission Meta manquante pour cette action (${code}). Vérifiez les permissions de l'application.`;
    }
    if (code === 4 || code === 17 || code === 32 || code === 613 || code === 9 || sub === 2207042) {
      return "Limite de publications Meta atteinte. Réessayez plus tard.";
    }
    if (sub === 2207026 || sub === 2207052 || code === 9004 || code === 352) {
      return "Meta n'a pas pu lire le fichier (format refusé ou lien expiré).";
    }
    if (code === 2 || code === 1 || error.httpStatus >= 500) return "Meta est indisponible pour le moment. Réessayez.";
    return `Erreur Meta${code !== null ? ` (${code})` : ""} : ${detail || "réponse inattendue"}`;
  }
  if (error instanceof Error && error.message.startsWith("ROOGO:")) return error.message.slice(6);
  return "La connexion à Meta a échoué. Réessayez.";
}

/** A French message we raise ourselves (not from Meta). */
function fail(message: string): never {
  throw new Error(`ROOGO:${message}`);
}

// --- Calls -------------------------------------------------------------------

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type PublishDeps = {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  now?: () => string;
  /** Wait between status checks. */
  pollIntervalMs?: number;
  /** Status checks before giving up for this run. */
  maxPolls?: number;
  /** Called with partial progress (e.g. an Instagram container id) so it can be saved before waiting. */
  onProgress?: (partial: NetworkResult) => Promise<void> | void;
};

type Json = Record<string, unknown>;

export async function graphCall(deps: PublishDeps, req: GraphRequest): Promise<Json> {
  const res = await deps.fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  let data: Json = {};
  try {
    data = ((await res.json()) ?? {}) as Json;
  } catch {
    data = {};
  }
  const err = data.error as { code?: number; error_subcode?: number; message?: string } | undefined;
  if (!res.ok || err) {
    throw new MetaError(err?.code ?? null, err?.error_subcode ?? null, res.status, err?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

/**
 * Facebook Page posts must be made with the Page token. A system user token
 * that manages the Page reads it from GET /{page-id}?fields=access_token.
 * The token is never logged; a failure throws a MetaError like any call.
 */
export async function withPageToken(deps: PublishDeps, cfg: MetaConfig): Promise<MetaConfig> {
  if (!cfg.needsPageToken) return cfg;
  const data = await graphCall(deps, get(cfg, cfg.pageId, "access_token"));
  const token = typeof data.access_token === "string" ? data.access_token : "";
  if (!token) fail("Le jeton Meta (META_GRAPH_TOKEN) ne donne pas accès à la Page Facebook. Vérifiez que l'utilisateur système gère la Page.");
  return { ...cfg, pageToken: token, needsPageToken: false };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
}

function absolutePermalink(link: string | null): string | null {
  if (!link) return null;
  return link.startsWith("http") ? link : `https://www.facebook.com${link.startsWith("/") ? "" : "/"}${link}`;
}

async function permalinkOrNull(deps: PublishDeps, req: GraphRequest, field: string): Promise<string | null> {
  try {
    const data = await graphCall(deps, req);
    return absolutePermalink(str(data[field]));
  } catch {
    // The post is out; a missing link is not a failure.
    return null;
  }
}

export type PublishMedia =
  /** durationSeconds: known for « Publier une vidéo » uploads (up to 3 minutes). */
  | { kind: "video"; url: string; durationSeconds?: number | null; sizeBytes?: number | null; mimeType?: string | null; width?: number | null; height?: number | null }
  | { kind: "images"; urls: string[] }
  | { kind: "text" };

function nowIso(deps: PublishDeps): string {
  return deps.now ? deps.now() : new Date().toISOString();
}

// --- Facebook publisher ------------------------------------------------------

/** Meta's limit for Facebook Reels published through the API. */
export const FACEBOOK_REEL_MAX_SECONDS = 90;

/**
 * Publishes one post to the Facebook Page. `commentOn` turns a text post into
 * a comment under an existing post (the 3D tour link under the carousel).
 */
export async function publishFacebook(
  deps: PublishDeps,
  cfg: MetaConfig,
  media: PublishMedia,
  caption: string,
  opts: { commentOn?: string | null } = {},
): Promise<NetworkResult> {
  try {
    if (media.kind === "text") {
      if (opts.commentOn) {
        const data = await graphCall(deps, fb.comment(cfg, opts.commentOn, caption));
        const id = str(data.id);
        if (!id) fail("Facebook n'a pas renvoyé d'identifiant.");
        return { status: "published", remote_id: id, permalink: await permalinkOrNull(deps, fb.permalink(cfg, id), "permalink_url"), published_at: nowIso(deps) };
      }
      const data = await graphCall(deps, fb.textPost(cfg, caption));
      const id = str(data.id);
      if (!id) fail("Facebook n'a pas renvoyé d'identifiant.");
      return { status: "published", remote_id: id, permalink: await permalinkOrNull(deps, fb.permalink(cfg, id), "permalink_url"), published_at: nowIso(deps) };
    }

    if (media.kind === "images") {
      if (!media.urls.length) fail("Aucune image à publier.");
      if (media.urls.length === 1) {
        const data = await graphCall(deps, fb.photo(cfg, media.urls[0], caption));
        const id = str(data.post_id) ?? str(data.id);
        if (!id) fail("Facebook n'a pas renvoyé d'identifiant.");
        return { status: "published", remote_id: id, permalink: await permalinkOrNull(deps, fb.permalink(cfg, id), "permalink_url"), published_at: nowIso(deps) };
      }
      const ids: string[] = [];
      for (const url of media.urls) {
        const data = await graphCall(deps, fb.unpublishedPhoto(cfg, url));
        const id = str(data.id);
        if (!id) fail("Facebook n'a pas accepté une des photos.");
        ids.push(id);
      }
      const data = await graphCall(deps, fb.multiPhotoPost(cfg, caption, ids));
      const id = str(data.id);
      if (!id) fail("Facebook n'a pas renvoyé d'identifiant.");
      return { status: "published", remote_id: id, permalink: await permalinkOrNull(deps, fb.permalink(cfg, id), "permalink_url"), published_at: nowIso(deps) };
    }

    // Facebook Reels stop at 90 s. A longer upload (« Publier une vidéo » allows
    // 3 minutes) goes out as a regular Page video, still vertical.
    if (media.durationSeconds != null && media.durationSeconds > FACEBOOK_REEL_MAX_SECONDS) {
      const data = await graphCall(deps, fb.videoPost(cfg, media.url, caption));
      const id = str(data.id);
      if (!id) fail("Facebook n'a pas renvoyé d'identifiant.");
      return {
        status: "published",
        remote_id: id,
        permalink: await permalinkOrNull(deps, fb.permalink(cfg, id), "permalink_url"),
        published_at: nowIso(deps),
        note: "Vidéo (plus de 90 s, pas un Reel)",
      };
    }

    // Video: Reels flow (vertical 9:16, 3 to 90 s, which is what the Studio renders).
    const start = await graphCall(deps, fb.reelStart(cfg));
    const videoId = str(start.video_id);
    if (!videoId) fail("Facebook n'a pas ouvert l'envoi de la vidéo.");
    const upload = await graphCall(deps, fb.reelUpload(cfg, videoId, media.url));
    if (upload.success === false) fail("Facebook n'a pas pu récupérer la vidéo.");

    const maxPolls = deps.maxPolls ?? 20;
    let uploaded = false;
    for (let i = 0; i < maxPolls; i += 1) {
      const data = await graphCall(deps, fb.reelStatus(cfg, videoId));
      const status = (data.status ?? {}) as { video_status?: string; uploading_phase?: { status?: string } };
      if (status.video_status === "error" || status.uploading_phase?.status === "error") {
        fail("Facebook a refusé la vidéo (format ou durée : 3 à 90 s, vertical).");
      }
      if (status.uploading_phase?.status === "complete" || status.video_status === "ready" || status.video_status === "upload_complete") {
        uploaded = true;
        break;
      }
      await deps.sleep(deps.pollIntervalMs ?? 5000);
    }
    if (!uploaded) fail("Facebook reçoit encore la vidéo. Réessayez dans quelques minutes.");

    const finish = await graphCall(deps, fb.reelFinish(cfg, videoId, caption));
    if (finish.success === false) fail("Facebook n'a pas publié la vidéo.");
    return {
      status: "published",
      remote_id: videoId,
      permalink: await permalinkOrNull(deps, fb.permalink(cfg, videoId), "permalink_url"),
      published_at: nowIso(deps),
    };
  } catch (error) {
    return { status: "failed", error: frenchMetaError(error) };
  }
}

// --- Instagram publisher -----------------------------------------------------

type ContainerState = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED" | "UNKNOWN";

async function waitForContainer(deps: PublishDeps, cfg: MetaConfig, containerId: string): Promise<ContainerState> {
  const maxPolls = deps.maxPolls ?? 20;
  for (let i = 0; i < maxPolls; i += 1) {
    const data = await graphCall(deps, ig.status(cfg, containerId));
    const code = (str(data.status_code) ?? "UNKNOWN") as ContainerState;
    if (code !== "IN_PROGRESS") return code;
    await deps.sleep(deps.pollIntervalMs ?? 5000);
  }
  return "IN_PROGRESS";
}

/**
 * Publishes one post to Instagram. With `existingContainerId` (saved by an
 * earlier run that timed out), the same container is reused instead of a new
 * upload, and a container Instagram already published is not published again.
 */
export async function publishInstagram(
  deps: PublishDeps,
  cfg: MetaConfig,
  media: PublishMedia,
  caption: string,
  opts: { existingContainerId?: string | null } = {},
): Promise<NetworkResult> {
  let containerId: string | null = opts.existingContainerId ?? null;
  try {
    if (media.kind === "text") fail("Instagram ne publie pas de texte seul.");

    if (!containerId) {
      if (media.kind === "video") {
        const data = await graphCall(deps, ig.reel(cfg, media.url, caption));
        containerId = str(data.id);
      } else if (media.kind === "images") {
        if (!media.urls.length) fail("Aucune image à publier.");
        if (media.urls.length > 10) fail("Instagram accepte 10 photos au plus.");
        if (media.urls.length === 1) {
          const data = await graphCall(deps, ig.image(cfg, media.urls[0], caption));
          containerId = str(data.id);
        } else {
          const children: string[] = [];
          for (const url of media.urls) {
            const data = await graphCall(deps, ig.carouselItem(cfg, url));
            const id = str(data.id);
            if (!id) fail("Instagram n'a pas accepté une des photos.");
            children.push(id);
          }
          for (const child of children) {
            const state = await waitForContainer(deps, cfg, child);
            if (state !== "FINISHED") fail("Instagram n'a pas pu préparer une des photos (JPEG uniquement).");
          }
          const data = await graphCall(deps, ig.carousel(cfg, children, caption));
          containerId = str(data.id);
        }
      }
      if (!containerId) fail("Instagram n'a pas renvoyé de conteneur.");
      await deps.onProgress?.({ status: "pending", container_id: containerId });
    }

    const state = await waitForContainer(deps, cfg, containerId);
    if (state === "PUBLISHED") {
      // An earlier run published it and died before saving: never publish twice.
      return { status: "published", container_id: containerId, remote_id: null, permalink: null, published_at: nowIso(deps) };
    }
    if (state === "IN_PROGRESS") {
      return {
        status: "pending",
        container_id: containerId,
        error: "Instagram traite encore la vidéo. Réessayez dans quelques minutes.",
      };
    }
    if (state === "EXPIRED") {
      return { status: "failed", container_id: null, error: "Le fichier préparé sur Instagram a expiré (24 h). Réessayez." };
    }
    if (state !== "FINISHED") {
      return { status: "failed", container_id: null, error: "Instagram a refusé le fichier (format, durée ou taille)." };
    }

    const published = await graphCall(deps, ig.publish(cfg, containerId));
    const mediaId = str(published.id);
    if (!mediaId) fail("Instagram n'a pas renvoyé d'identifiant.");
    return {
      status: "published",
      container_id: containerId,
      remote_id: mediaId,
      permalink: await permalinkOrNull(deps, ig.permalink(cfg, mediaId), "permalink"),
      published_at: nowIso(deps),
    };
  } catch (error) {
    return { status: "failed", container_id: containerId, error: frenchMetaError(error) };
  }
}
