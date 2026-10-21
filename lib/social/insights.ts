// Social statistics for Studio > Statistiques: the Roogo Burkina Facebook Page
// and the @roogo.burkina Instagram account, read from the Meta Graph API.
//
// Read only: every call here is a GET. Nothing is ever posted.
//
// No runtime imports, so node:test loads this file directly (lib/social/
// insights.test.mjs) with a fake fetch. The server wrapper
// (lib/social/insights-server.ts) reads the env, swaps the system user token
// for the Page token and caches the result.
//
// Each piece is read on its own and never throws: a missing permission on
// post insights still shows the follower count, the posts and their likes.
// Errors are rebuilt in French from Meta's code; the token is sent in the
// Authorization header and never appears in a message or a log.
//
// Metrics (Graph API v25, after the 2025 « views » migration):
//   Facebook post        /{post}/insights          post_total_media_view_unique, post_media_view
//   Facebook reel        /{video}/video_insights   post_impressions_unique, blue_reels_play_count
//   Facebook page        /{page}/insights          page_total_media_view_unique, page_media_view, page_post_engagements (days_28)
//   Instagram media      /{media}/insights         reach, views, likes, comments, shares, saved, total_interactions
//   Instagram account    /{ig}/insights            reach, views, accounts_engaged, total_interactions (total_value)
// A metric Meta refuses as unknown (#100) is retried alone, then skipped for
// the rest of the run, so one renamed metric does not blank the whole table.

export const SOCIAL_GRAPH_VERSION = "v25.0";
const GRAPH_HOST = "https://graph.facebook.com";
const TIMEOUT_MS = 12_000;
/** Posts read for the cadence (fields only, cheap). */
export const CADENCE_POSTS = 60;
/** Most recent posts whose insights are read (one call each). */
export const INSIGHT_POSTS = 12;
const CONCURRENCY = 4;

export type Network = "facebook" | "instagram";

export type PostFormat = "reel" | "video" | "photo" | "carrousel" | "texte" | "autre";

export type SocialPost = {
  network: Network;
  id: string;
  permalink: string | null;
  createdAt: string;
  caption: string;
  thumbnail: string | null;
  format: PostFormat;
  /** Unique accounts reached (Instagram reach, Facebook unique viewers). */
  reach: number | null;
  /** Views (Instagram views, Facebook media views or Reels plays). */
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  /** Likes + comments + shares + saves, as Meta counts them when it gives the total. */
  interactions: number | null;
  /** interactions / reach, 0..1, null without reach. */
  engagementRate: number | null;
};

export type WeekCount = { weekStart: string; count: number };

export type Cadence = {
  last7: number;
  last30: number;
  /** Average posts per week over the last 4 full weeks plus this one. */
  perWeek: number;
  daysSinceLast: number | null;
  lastPostAt: string | null;
  /** Oldest first, 8 weeks ending with the current one (Monday starts). */
  weeks: WeekCount[];
};

export type AccountTotals = {
  /** Over the last 28 days. */
  reach: number | null;
  views: number | null;
  interactions: number | null;
};

export type AccountSnapshot = {
  network: Network;
  configured: boolean;
  ok: boolean;
  name: string | null;
  handle: string | null;
  followers: number | null;
  posts: SocialPost[];
  postCount: number;
  cadence: Cadence;
  totals: AccountTotals | null;
  /** False when the per-post statistics could not be read (permission, token). */
  insightsAvailable: boolean;
  /** French, shown on the card. */
  warnings: string[];
  /** French. Set when the account itself could not be read. */
  error: string | null;
};

export type SocialSnapshot = {
  fetchedAt: string;
  facebook: AccountSnapshot;
  instagram: AccountSnapshot;
  /** Env names missing (names only). */
  missing: string[];
};

export type SocialConfig = {
  graphVersion: string;
  pageId: string;
  igUserId: string;
  /** Token for Page calls (the Page token once swapped). */
  pageToken: string;
  /** Token for Instagram calls (system user token or Page token). */
  igToken: string;
};

export type FetchLike = (
  url: string,
  init: { method: "GET"; headers: Record<string, string>; signal?: AbortSignal; cache?: "no-store" },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

// --- Errors ------------------------------------------------------------------

export class GraphError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;
  readonly httpStatus: number;
  constructor(code: number | null, subcode: number | null, httpStatus: number, message: string) {
    super(message);
    this.name = "GraphError";
    this.code = code;
    this.subcode = subcode;
    this.httpStatus = httpStatus;
  }
}

export type ErrorKind = "token" | "permission" | "limit" | "unknown_metric" | "unavailable" | "network" | "other";

export function errorKind(error: unknown): ErrorKind {
  if (error instanceof GraphError) {
    const c = error.code;
    if (c === 190 || c === 102 || c === 463 || c === 467) return "token";
    if (c === 10 || c === 200 || (c !== null && c > 200 && c < 300)) return "permission";
    if (c === 4 || c === 17 || c === 32 || c === 613 || c === 80001 || c === 80002) return "limit";
    if (c === 100 && /metric/i.test(error.message)) return "unknown_metric";
    if (c === 1 || c === 2 || error.httpStatus >= 500) return "unavailable";
    return "other";
  }
  return "network";
}

/** French text for the page. Never includes a token or a URL. */
export function frenchSocialError(error: unknown, network: Network, what: "compte" | "publications" | "statistiques"): string {
  const label = network === "facebook" ? "Facebook" : "Instagram";
  const perms =
    network === "facebook"
      ? what === "statistiques"
        ? "read_insights et pages_read_engagement"
        : "pages_read_engagement"
      : what === "statistiques"
        ? "instagram_manage_insights"
        : "instagram_basic";
  switch (errorKind(error)) {
    case "token":
      return `Le jeton Meta a expiré ou a été révoqué (${label}). Il faut générer un nouveau jeton META_GRAPH_TOKEN dans le Business Manager puis le remplacer sur Vercel.`;
    case "permission":
      return `Permission Meta manquante pour lire ${what === "compte" ? "le compte" : what === "publications" ? "les publications" : "les statistiques"} ${label} : ajoutez ${perms} au jeton.`;
    case "limit":
      return `Meta limite les lectures pour le moment (${label}). Les chiffres reviendront au prochain rafraîchissement.`;
    case "unavailable":
      return `Meta ne répond pas pour le moment (${label}). Réessayez plus tard.`;
    case "network":
      return `Pas de réponse de Meta (${label}). Réessayez plus tard.`;
    default: {
      const e = error as GraphError;
      const detail = String(e?.message ?? "")
        .replace(/https?:\/\/\S+/g, "[lien]")
        .replace(/access_token=\S+/g, "")
        .slice(0, 140);
      return `Erreur Meta${e?.code != null ? ` (${e.code})` : ""} sur ${label} : ${detail || "réponse inattendue"}`;
    }
  }
}

/** For server logs: status, code and kind, never the token or the URL. */
export function logShape(error: unknown) {
  if (error instanceof GraphError) {
    return { kind: errorKind(error), status: error.httpStatus, code: error.code, subcode: error.subcode, message: error.message.slice(0, 200) };
  }
  return { kind: "network", message: error instanceof Error ? error.message.slice(0, 200) : String(error) };
}

// --- Graph GET -----------------------------------------------------------------

type Json = Record<string, unknown>;

export function graphUrl(version: string, path: string, query: Record<string, string> = {}): string {
  const qs = new URLSearchParams(query).toString();
  return `${GRAPH_HOST}/${version}/${path}${qs ? `?${qs}` : ""}`;
}

export async function graphGet(
  fetchImpl: FetchLike,
  version: string,
  token: string,
  path: string,
  query: Record<string, string> = {},
): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res;
    try {
      res = await fetchImpl(graphUrl(version, path, query), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new Error(aborted ? `pas de réponse en ${TIMEOUT_MS / 1000} s` : "erreur réseau");
    }
    let data: Json = {};
    try {
      data = ((await res.json()) ?? {}) as Json;
    } catch {
      data = {};
    }
    const err = data.error as { code?: number; error_subcode?: number; message?: string } | undefined;
    if (!res.ok || err) {
      throw new GraphError(err?.code ?? null, err?.error_subcode ?? null, res.status, err?.message ?? `HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// --- Parsing -------------------------------------------------------------------

export function num(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
}

/** Caption cut to one readable line. */
export function shortCaption(text: unknown, max = 140): string {
  const flat = (typeof text === "string" ? text : "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * Insights responses: { data: [{ name, values: [{ value }] }] } or, for
 * metric_type=total_value, { data: [{ name, total_value: { value } }] }.
 * Returns name -> number (a reactions object is summed).
 */
export function parseInsights(body: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return out;
  for (const item of data as Json[]) {
    const name = str(item?.name);
    if (!name) continue;
    let raw: unknown = (item.total_value as Json | undefined)?.value;
    if (raw === undefined && Array.isArray(item.values) && item.values.length) {
      raw = (item.values[item.values.length - 1] as Json)?.value;
    }
    if (raw && typeof raw === "object") {
      const sum = Object.values(raw as Record<string, unknown>).reduce<number>((acc, v) => acc + (num(v) ?? 0), 0);
      out[name] = sum;
      continue;
    }
    const n = num(raw);
    if (n !== null) out[name] = n;
  }
  return out;
}

function summaryCount(value: unknown): number | null {
  return num(((value as Json | undefined)?.summary as Json | undefined)?.total_count);
}

export function facebookFormat(post: Json): PostFormat {
  const permalink = str(post.permalink_url) ?? "";
  const attachment = (((post.attachments as Json | undefined)?.data as Json[] | undefined) ?? [])[0];
  const type = str(attachment?.type) ?? str(attachment?.media_type) ?? "";
  if (permalink.includes("/reel/")) return "reel";
  if (type.includes("video")) return "video";
  if (type === "album" || type.includes("multi")) return "carrousel";
  if (type.includes("photo")) return "photo";
  if (!attachment) return "texte";
  return "autre";
}

/** The video id behind a Facebook video or reel post, for /video_insights. */
export function facebookVideoId(post: Json): string | null {
  const attachment = (((post.attachments as Json | undefined)?.data as Json[] | undefined) ?? [])[0];
  const type = str(attachment?.type) ?? "";
  if (!type.includes("video")) return null;
  return str((attachment?.target as Json | undefined)?.id);
}

export function parseFacebookPost(post: Json): SocialPost | null {
  const id = str(post.id);
  const createdAt = str(post.created_time);
  if (!id || !createdAt) return null;
  const likes = summaryCount(post.reactions);
  const comments = summaryCount(post.comments);
  const shares = num((post.shares as Json | undefined)?.count) ?? (post.shares === undefined ? 0 : null);
  return {
    network: "facebook",
    id,
    permalink: str(post.permalink_url),
    createdAt: new Date(createdAt).toISOString(),
    caption: shortCaption(post.message ?? post.story),
    thumbnail: str(post.full_picture),
    format: facebookFormat(post),
    reach: null,
    views: null,
    likes,
    comments,
    shares,
    saves: null,
    interactions: likes === null && comments === null ? null : (likes ?? 0) + (comments ?? 0) + (shares ?? 0),
    engagementRate: null,
  };
}

export function instagramFormat(media: Json): PostFormat {
  const product = str(media.media_product_type) ?? "";
  const type = str(media.media_type) ?? "";
  if (product === "REELS") return "reel";
  if (type === "CAROUSEL_ALBUM") return "carrousel";
  if (type === "VIDEO") return "video";
  if (type === "IMAGE") return "photo";
  return "autre";
}

export function parseInstagramMedia(media: Json): SocialPost | null {
  const id = str(media.id);
  const createdAt = str(media.timestamp);
  if (!id || !createdAt) return null;
  const likes = num(media.like_count);
  const comments = num(media.comments_count);
  const format = instagramFormat(media);
  return {
    network: "instagram",
    id,
    permalink: str(media.permalink),
    createdAt: new Date(createdAt).toISOString(),
    caption: shortCaption(media.caption),
    thumbnail: format === "reel" || format === "video" ? str(media.thumbnail_url) ?? null : str(media.media_url) ?? str(media.thumbnail_url),
    format,
    reach: null,
    views: null,
    likes,
    comments,
    shares: null,
    saves: null,
    interactions: likes === null && comments === null ? null : (likes ?? 0) + (comments ?? 0),
    engagementRate: null,
  };
}

export function withRate(post: SocialPost): SocialPost {
  const rate = post.reach && post.interactions !== null ? post.interactions / post.reach : null;
  return { ...post, engagementRate: rate === null ? null : Math.min(1, Math.round(rate * 10000) / 10000) };
}

// --- Cadence -------------------------------------------------------------------

const DAY = 86_400_000;

/** Monday of the week of `iso` (UTC, the Ouagadougou time zone), as YYYY-MM-DD. */
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * DAY).toISOString().slice(0, 10);
}

export function cadenceOf(dates: string[], now: Date, weeks = 8): Cadence {
  const times = dates.map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t) && t <= now.getTime() + DAY).sort((a, b) => b - a);
  const last = times[0] ?? null;
  const thisMonday = mondayOf(now);
  const out: WeekCount[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(new Date(`${thisMonday}T00:00:00Z`).getTime() - i * 7 * DAY);
    const end = start.getTime() + 7 * DAY;
    out.push({ weekStart: start.toISOString().slice(0, 10), count: times.filter((t) => t >= start.getTime() && t < end).length });
  }
  const recent = out.slice(-5);
  return {
    last7: times.filter((t) => now.getTime() - t < 7 * DAY).length,
    last30: times.filter((t) => now.getTime() - t < 30 * DAY).length,
    perWeek: Math.round((recent.reduce((s, w) => s + w.count, 0) / recent.length) * 10) / 10,
    daysSinceLast: last === null ? null : Math.max(0, Math.floor((now.getTime() - last) / DAY)),
    lastPostAt: last === null ? null : new Date(last).toISOString(),
    weeks: out,
  };
}

// --- Reading -------------------------------------------------------------------

export type Deps = { fetch: FetchLike; now?: () => Date };

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Reads insights for `metrics`. A metric Meta calls unknown is retried alone
 * and remembered in `refused` so later posts skip it. Other errors throw.
 */
export async function readInsights(
  deps: Deps,
  version: string,
  token: string,
  path: string,
  metrics: string[],
  refused: Set<string>,
  extra: Record<string, string> = {},
): Promise<Record<string, number>> {
  const wanted = metrics.filter((m) => !refused.has(m));
  if (!wanted.length) return {};
  try {
    return parseInsights(await graphGet(deps.fetch, version, token, path, { metric: wanted.join(","), ...extra }));
  } catch (error) {
    if (errorKind(error) !== "unknown_metric") throw error;
    if (wanted.length === 1) {
      refused.add(wanted[0]);
      return {};
    }
  }
  const out: Record<string, number> = {};
  for (const metric of wanted) {
    try {
      Object.assign(out, parseInsights(await graphGet(deps.fetch, version, token, path, { metric, ...extra })));
    } catch (error) {
      if (errorKind(error) === "unknown_metric") refused.add(metric);
      else throw error;
    }
  }
  return out;
}

function emptyAccount(network: Network, configured: boolean, now: Date): AccountSnapshot {
  return {
    network,
    configured,
    ok: false,
    name: null,
    handle: null,
    followers: null,
    posts: [],
    postCount: 0,
    cadence: cadenceOf([], now),
    totals: null,
    insightsAvailable: false,
    warnings: [],
    error: null,
  };
}

type Logger = (message: string, detail: Record<string, unknown>) => void;

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

const FB_POST_FIELDS = [
  "id",
  "message",
  "story",
  "created_time",
  "permalink_url",
  "full_picture",
  "attachments{type,media_type,target{id}}",
  "shares",
  "reactions.summary(total_count).limit(0)",
  "comments.summary(total_count).limit(0)",
].join(",");

export async function readFacebook(deps: Deps, cfg: SocialConfig, log: Logger = () => {}): Promise<AccountSnapshot> {
  const now = deps.now?.() ?? new Date();
  const acc = emptyAccount("facebook", Boolean(cfg.pageId && cfg.pageToken), now);
  if (!acc.configured) {
    acc.error = "Facebook n'est pas configuré : META_GRAPH_TOKEN et META_PAGE_ID sont nécessaires sur Vercel.";
    return acc;
  }
  const v = cfg.graphVersion;
  const t = cfg.pageToken;

  try {
    const page = await graphGet(deps.fetch, v, t, cfg.pageId, { fields: "name,username,followers_count,fan_count" });
    acc.name = str(page.name);
    acc.handle = str(page.username);
    acc.followers = num(page.followers_count) ?? num(page.fan_count);
    acc.ok = true;
  } catch (error) {
    log("[social-insights] facebook page read failed", logShape(error));
    acc.error = frenchSocialError(error, "facebook", "compte");
    return acc;
  }

  let posts: SocialPost[] = [];
  let rawById = new Map<string, Json>();
  try {
    const since = Math.floor((now.getTime() - 60 * DAY) / 1000);
    const body = await graphGet(deps.fetch, v, t, `${cfg.pageId}/published_posts`, {
      fields: FB_POST_FIELDS,
      limit: String(CADENCE_POSTS),
      since: String(since),
    });
    const rows = Array.isArray(body.data) ? (body.data as Json[]) : [];
    rawById = new Map(rows.map((r) => [str(r.id) ?? "", r]));
    posts = rows.map(parseFacebookPost).filter((p): p is SocialPost => p !== null);
  } catch (error) {
    log("[social-insights] facebook posts read failed", logShape(error));
    acc.warnings.push(frenchSocialError(error, "facebook", "publications"));
  }
  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  acc.cadence = cadenceOf(posts.map((p) => p.createdAt), now);
  acc.postCount = posts.length;

  const refused = new Set<string>();
  let insightError: unknown = null;
  let anyInsight = false;
  const detailed = await mapLimit(posts.slice(0, INSIGHT_POSTS), CONCURRENCY, async (post) => {
    if (insightError && errorKind(insightError) !== "other") return post;
    try {
      const raw = rawById.get(post.id) ?? {};
      const videoId = facebookVideoId(raw);
      let m: Record<string, number> = {};
      if (videoId) {
        m = await readInsights(deps, v, t, `${videoId}/video_insights`, ["post_impressions_unique", "blue_reels_play_count", "total_video_views"], refused);
      }
      if (m.post_impressions_unique === undefined) {
        Object.assign(m, await readInsights(deps, v, t, `${post.id}/insights`, ["post_total_media_view_unique", "post_media_view"], refused));
      }
      const reach = m.post_impressions_unique ?? m.post_total_media_view_unique ?? null;
      const views = m.blue_reels_play_count ?? m.total_video_views ?? m.post_media_view ?? null;
      if (reach !== null || views !== null) anyInsight = true;
      return withRate({ ...post, reach, views });
    } catch (error) {
      insightError = insightError ?? error;
      return post;
    }
  });
  acc.posts = [...detailed, ...posts.slice(INSIGHT_POSTS)].slice(0, INSIGHT_POSTS);

  try {
    const m = await readInsights(deps, v, t, `${cfg.pageId}/insights`, ["page_total_media_view_unique", "page_media_view", "page_post_engagements"], refused, {
      period: "days_28",
    });
    if (Object.keys(m).length) {
      acc.totals = {
        reach: m.page_total_media_view_unique ?? null,
        views: m.page_media_view ?? null,
        interactions: m.page_post_engagements ?? null,
      };
      anyInsight = true;
    }
  } catch (error) {
    insightError = insightError ?? error;
  }

  acc.insightsAvailable = anyInsight;
  if (insightError) {
    log("[social-insights] facebook insights read failed", logShape(insightError));
    acc.warnings.push(frenchSocialError(insightError, "facebook", "statistiques"));
  } else if (!anyInsight && posts.length) {
    acc.warnings.push("Meta ne donne pas encore la portée ni les vues des publications Facebook. Les mentions J'aime, commentaires et partages restent à jour.");
  }
  if (refused.size) log("[social-insights] facebook metrics refused by Meta", { metrics: [...refused] });
  acc.warnings = dedupe(acc.warnings);
  return acc;
}

const IG_MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url";

export async function readInstagram(deps: Deps, cfg: SocialConfig, log: Logger = () => {}): Promise<AccountSnapshot> {
  const now = deps.now?.() ?? new Date();
  const acc = emptyAccount("instagram", Boolean(cfg.igUserId && cfg.igToken), now);
  if (!acc.configured) {
    acc.error = "Instagram n'est pas configuré : META_GRAPH_TOKEN et META_IG_ACCOUNT_ID sont nécessaires sur Vercel.";
    return acc;
  }
  const v = cfg.graphVersion;
  const t = cfg.igToken;

  try {
    const user = await graphGet(deps.fetch, v, t, cfg.igUserId, { fields: "username,name,followers_count,media_count" });
    acc.name = str(user.name) ?? str(user.username);
    acc.handle = str(user.username);
    acc.followers = num(user.followers_count);
    acc.ok = true;
  } catch (error) {
    log("[social-insights] instagram account read failed", logShape(error));
    acc.error = frenchSocialError(error, "instagram", "compte");
    return acc;
  }

  let posts: SocialPost[] = [];
  try {
    const body = await graphGet(deps.fetch, v, t, `${cfg.igUserId}/media`, { fields: IG_MEDIA_FIELDS, limit: String(CADENCE_POSTS) });
    posts = (Array.isArray(body.data) ? (body.data as Json[]) : []).map(parseInstagramMedia).filter((p): p is SocialPost => p !== null);
  } catch (error) {
    log("[social-insights] instagram media read failed", logShape(error));
    acc.warnings.push(frenchSocialError(error, "instagram", "publications"));
  }
  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  acc.cadence = cadenceOf(posts.map((p) => p.createdAt), now);
  acc.postCount = posts.length;

  const refused = new Set<string>();
  let insightError: unknown = null;
  let anyInsight = false;
  const detailed = await mapLimit(posts.slice(0, INSIGHT_POSTS), CONCURRENCY, async (post) => {
    if (insightError && errorKind(insightError) !== "other") return post;
    try {
      const m = await readInsights(deps, v, t, `${post.id}/insights`, ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"], refused);
      if (!Object.keys(m).length) return post;
      anyInsight = true;
      const likes = m.likes ?? post.likes;
      const comments = m.comments ?? post.comments;
      const shares = m.shares ?? null;
      const saves = m.saved ?? null;
      return withRate({
        ...post,
        reach: m.reach ?? null,
        views: m.views ?? null,
        likes,
        comments,
        shares,
        saves,
        interactions: m.total_interactions ?? (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0),
      });
    } catch (error) {
      insightError = insightError ?? error;
      return post;
    }
  });
  acc.posts = detailed;

  try {
    const until = Math.floor(now.getTime() / 1000);
    const since = until - 28 * 86_400;
    const m = await readInsights(deps, v, t, `${cfg.igUserId}/insights`, ["reach", "views", "total_interactions"], refused, {
      period: "day",
      metric_type: "total_value",
      since: String(since),
      until: String(until),
    });
    if (Object.keys(m).length) {
      acc.totals = { reach: m.reach ?? null, views: m.views ?? null, interactions: m.total_interactions ?? null };
      anyInsight = true;
    }
  } catch (error) {
    insightError = insightError ?? error;
  }

  acc.insightsAvailable = anyInsight;
  if (insightError) {
    log("[social-insights] instagram insights read failed", logShape(insightError));
    acc.warnings.push(frenchSocialError(insightError, "instagram", "statistiques"));
  }
  if (refused.size) log("[social-insights] instagram metrics refused by Meta", { metrics: [...refused] });
  acc.warnings = dedupe(acc.warnings);
  return acc;
}

export async function readSocialSnapshot(
  deps: Deps,
  cfg: SocialConfig,
  missing: string[],
  log: Logger = () => {},
): Promise<SocialSnapshot> {
  const now = deps.now?.() ?? new Date();
  const [facebook, instagram] = await Promise.all([readFacebook(deps, cfg, log), readInstagram(deps, cfg, log)]);
  return { fetchedAt: now.toISOString(), facebook, instagram, missing };
}

/** A snapshot worth caching: at least one account was read. */
export function isCacheable(snapshot: SocialSnapshot): boolean {
  return snapshot.facebook.ok || snapshot.instagram.ok;
}

// --- Follower history (team_goal_readings) -------------------------------------

export type ReadingPoint = { date: string; value: number };

export type FollowerTrend = {
  points: ReadingPoint[];
  /** Change since the reading closest to 30 days ago (or the oldest one). */
  delta: number | null;
  since: string | null;
};

/** One point per day (the highest value that day), oldest first, and the 30-day change. */
export function followerTrend(rows: { measured_on: string; value: number }[], current: number | null, now: Date): FollowerTrend {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.measured_on) || !Number.isFinite(r.value)) continue;
    byDay.set(r.measured_on, Math.max(byDay.get(r.measured_on) ?? 0, r.value));
  }
  const points = [...byDay.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  const latest = current ?? points[points.length - 1]?.value ?? null;
  if (latest === null || !points.length) return { points, delta: null, since: null };
  const target = new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10);
  const base = [...points].reverse().find((p) => p.date <= target) ?? points[0];
  if (base.date === now.toISOString().slice(0, 10)) return { points, delta: null, since: null };
  return { points, delta: latest - base.value, since: base.date };
}
