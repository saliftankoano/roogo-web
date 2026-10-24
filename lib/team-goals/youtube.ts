// Roogo's YouTube channel for Studio > Statistiques and « Nos objectifs »,
// through Google's official APIs only (PRD 1, approved 2026-10-23):
// - OAuth 2.0 for web server apps, with state and PKCE (S256):
//   https://developers.google.com/identity/protocols/oauth2/web-server
//   access_type=offline and prompt=consent so Google always returns a
//   refresh token; the access token lasts about 1 hour.
// - Scopes asked once: youtube.readonly (channel statistics, uploads) and
//   youtube.upload (the « Publier partout » PR will upload Shorts with the
//   same connection, PRD 1.4).
// - YouTube Data API v3: GET /youtube/v3/channels?part=snippet,statistics,
//   contentDetails&mine=true (1 quota unit).
//   https://developers.google.com/youtube/v3/docs/channels/list
//
// Only node:crypto is imported (PKCE): parsing, the refresh decision and the
// HTTP calls (with an injected fetch) are tested with node:test
// (youtube.test.mjs). Tokens and the client secret are never logged; errors
// carry the HTTP status and Google's error code only.
//
// Env (server only): YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and optionally
// YOUTUBE_REDIRECT_URI (default: <site>/api/admin/social/youtube/callback).

import { createHash, randomBytes } from "node:crypto";

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
/** Asked once so nobody reconnects when publishing arrives (PRD 1.4). */
export const YOUTUBE_SCOPE = `${YOUTUBE_READONLY_SCOPE} ${YOUTUBE_UPLOAD_SCOPE}`;
export const YOUTUBE_CALLBACK_PATH = "/api/admin/social/youtube/callback";
/** Refresh the access token when it has less than this left. */
export const REFRESH_MARGIN_MS = 10 * 60 * 1000;
/** A Google app left in « Testing » gives refresh tokens that die after 7 days. */
export const TESTING_MODE_DAYS = 7;
const TIMEOUT_MS = 10_000;

export type YouTubeConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** The Google OAuth client from the env, or null when YouTube is not set up. */
export function youtubeConfig(env: Record<string, string | undefined>, origin: string): YouTubeConfig | null {
  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectUri = env.YOUTUBE_REDIRECT_URI?.trim() || `${origin.replace(/\/$/, "")}${YOUTUBE_CALLBACK_PATH}`;
  return { clientId, clientSecret, redirectUri };
}

/** A random state (CSRF) and a PKCE verifier with its S256 challenge. */
export function newOAuthSecrets(): { state: string; verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { state: randomBytes(24).toString("base64url"), verifier, challenge: pkceChallenge(verifier) };
}

/** BASE64URL(SHA256(verifier)), RFC 7636. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Google's consent page. Always asks again (prompt=consent) so the right account is chosen and a refresh token comes back. */
export function buildAuthorizeUrl(config: Pick<YouTubeConfig, "clientId" | "redirectUri">, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

export type YouTubeTokens = {
  accessToken: string;
  accessExpiresAt: string;
  /** Empty on a refresh answer: Google keeps the same refresh token. */
  refreshToken: string;
  /** Only when Google says the refresh token expires (time-limited grants, apps in « Testing »). */
  refreshExpiresAt: string | null;
  scope: string;
};

export type YouTubeFailure = { ok: false; error: string; status?: number; code?: string };

/** Google's OAuth error as { code, message }, or null when the body is not an error. */
export function googleOAuthErrorOf(body: unknown): { code: string; message: string } | null {
  const b = body as { error?: unknown; error_description?: unknown } | null;
  if (!b || typeof b !== "object") return null;
  if (typeof b.error === "string" && b.error) {
    return { code: b.error, message: typeof b.error_description === "string" ? b.error_description.slice(0, 200) : "" };
  }
  return null;
}

/** French reason for a refused token call; invalid_grant also names the 7-day « Testing » limit. */
export function frenchTokenError(code: string | undefined, message: string): string {
  if (code === "invalid_grant") {
    return `Autorisation Google expirée ou révoquée : reconnecter YouTube. Si l'application Google est encore en mode « Test », Google coupe la connexion après ${TESTING_MODE_DAYS} jours.`;
  }
  if (code === "invalid_client" || code === "unauthorized_client") {
    return "Identifiants Google refusés (YOUTUBE_CLIENT_ID ou YOUTUBE_CLIENT_SECRET).";
  }
  return `Google ${code ?? "erreur"}${message ? ` : ${message}` : ""}`;
}

/** Tokens from a token endpoint answer, with absolute expiry times. `refreshRequired` is true for the code exchange. */
export function parseTokenResponse(body: unknown, now: Date, refreshRequired = true): ({ ok: true } & YouTubeTokens) | YouTubeFailure {
  const err = googleOAuthErrorOf(body);
  if (err) return { ok: false, code: err.code, error: frenchTokenError(err.code, err.message) };
  const b = (body ?? {}) as Record<string, unknown>;
  const access = typeof b.access_token === "string" ? b.access_token : "";
  const refresh = typeof b.refresh_token === "string" ? b.refresh_token : "";
  const expiresIn = Number(b.expires_in);
  if (!access || !Number.isFinite(expiresIn) || expiresIn <= 0) return { ok: false, error: "Réponse Google incomplète (jeton absent)" };
  if (refreshRequired && !refresh) {
    return { ok: false, code: "no_refresh_token", error: "Google n'a pas donné de jeton de rafraîchissement : reconnecter YouTube." };
  }
  const refreshIn = Number(b.refresh_token_expires_in);
  return {
    ok: true,
    accessToken: access,
    accessExpiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    refreshToken: refresh,
    refreshExpiresAt: Number.isFinite(refreshIn) && refreshIn > 0 ? new Date(now.getTime() + refreshIn * 1000).toISOString() : null,
    scope: typeof b.scope === "string" ? b.scope : "",
  };
}

/** True when `wanted` was granted (Google lets the person untick a scope). */
export function hasScope(scope: string, wanted: string): boolean {
  return scope.split(/[,\s]+/).includes(wanted);
}

/** What to do with stored tokens before reading: use, refresh, or ask the founder to reconnect. */
export function tokenAction(stored: { accessExpiresAt: string; refreshExpiresAt: string | null }, now: Date): "use" | "refresh" | "reconnect" {
  const t = now.getTime();
  if (Date.parse(stored.accessExpiresAt) - t > REFRESH_MARGIN_MS) return "use";
  if (stored.refreshExpiresAt && Date.parse(stored.refreshExpiresAt) <= t) return "reconnect";
  return "refresh";
}

/** The refresh token dies within 7 days or so: the Google app is most likely still in « Testing ». */
export function looksLikeTestingMode(refreshExpiresAt: string | null, connectedAt: string | null): boolean {
  if (!refreshExpiresAt) return false;
  const from = connectedAt ? Date.parse(connectedAt) : NaN;
  const end = Date.parse(refreshExpiresAt);
  if (!Number.isFinite(end)) return false;
  if (!Number.isFinite(from)) return true;
  return end - from <= (TESTING_MODE_DAYS + 1) * 86_400_000;
}

type Fetch = typeof fetch;

async function postForm(url: string, form: Record<string, string>, fetchImpl: Fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

function networkFailure(error: unknown): YouTubeFailure {
  const aborted = error instanceof Error && error.name === "AbortError";
  return { ok: false, error: aborted ? `Pas de réponse de Google en ${TIMEOUT_MS / 1000} s` : `Erreur réseau: ${error instanceof Error ? error.message : String(error)}` };
}

async function tokenCall(form: Record<string, string>, fetchImpl: Fetch, now: Date, refreshRequired: boolean) {
  try {
    const { res, body } = await postForm(GOOGLE_TOKEN_URL, form, fetchImpl);
    const parsed = parseTokenResponse(body, now, refreshRequired);
    if (!res.ok && parsed.ok) return { ok: false as const, status: res.status, error: `HTTP ${res.status}` };
    return parsed.ok ? parsed : { ...parsed, status: res.status };
  } catch (error) {
    return networkFailure(error);
  }
}

/** Exchanges the code from the callback (with the PKCE verifier) for tokens. */
export function exchangeCode(config: YouTubeConfig, code: string, verifier: string, fetchImpl: Fetch = fetch, now = new Date()) {
  return tokenCall(
    {
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    },
    fetchImpl,
    now,
    true,
  );
}

/** A new access token. Google usually keeps the refresh token (refreshToken is then ""). */
export function refreshTokens(config: Pick<YouTubeConfig, "clientId" | "clientSecret">, refreshToken: string, fetchImpl: Fetch = fetch, now = new Date()) {
  return tokenCall(
    { client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken },
    fetchImpl,
    now,
    false,
  );
}

/** Revokes the grant at Google (disconnect). Revoking the refresh token ends the access token too. Never throws. */
export async function revokeToken(token: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  try {
    const { res } = await postForm(GOOGLE_REVOKE_URL, { token }, fetchImpl);
    return res.ok;
  } catch {
    return false;
  }
}

export type YouTubeChannel = {
  channelId: string;
  title: string | null;
  /** « @roogo... » without the @, when the channel has a handle. */
  handle: string | null;
  /** Rounded by YouTube (3 significant figures above 1 000). Null when the channel hides it. */
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
  uploadsPlaylistId: string | null;
  thumbnail: string | null;
};

function count(raw: unknown): number | null {
  const n = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100_000_000_000 ? n : null;
}

/** The connected channel from a channels.list?mine=true answer. */
export function parseChannel(body: unknown): ({ ok: true } & YouTubeChannel) | YouTubeFailure {
  const apiError = (body as { error?: { code?: unknown; message?: unknown; errors?: { reason?: unknown }[] } } | null)?.error;
  if (apiError && typeof apiError === "object") {
    const reason = typeof apiError.errors?.[0]?.reason === "string" ? apiError.errors[0].reason : undefined;
    return { ok: false, code: reason, error: `YouTube ${reason ?? apiError.code ?? "erreur"}: ${typeof apiError.message === "string" ? apiError.message.slice(0, 200) : ""}`.trim() };
  }
  const item = (body as { items?: Record<string, unknown>[] } | null)?.items?.[0];
  if (!item || typeof item.id !== "string") {
    return { ok: false, code: "no_channel", error: "Ce compte Google n'a pas de chaîne YouTube. Connectez le compte qui possède la chaîne Roogo." };
  }
  const snippet = (item.snippet ?? {}) as Record<string, unknown>;
  const stats = (item.statistics ?? {}) as Record<string, unknown>;
  const uploads = ((item.contentDetails as { relatedPlaylists?: { uploads?: unknown } } | undefined)?.relatedPlaylists?.uploads);
  const thumbs = (snippet.thumbnails ?? {}) as Record<string, { url?: unknown } | undefined>;
  const thumb = thumbs.default?.url ?? thumbs.medium?.url;
  const custom = typeof snippet.customUrl === "string" ? snippet.customUrl.replace(/^@/, "").slice(0, 80) : null;
  return {
    ok: true,
    channelId: item.id,
    title: typeof snippet.title === "string" ? snippet.title.slice(0, 80) : null,
    handle: custom || null,
    subscriberCount: stats.hiddenSubscriberCount === true ? null : count(stats.subscriberCount),
    videoCount: count(stats.videoCount),
    viewCount: count(stats.viewCount),
    uploadsPlaylistId: typeof uploads === "string" ? uploads : null,
    thumbnail: typeof thumb === "string" ? thumb : null,
  };
}

/** Reads the connected channel with an access token. Never throws. */
export async function fetchYouTubeChannel(accessToken: string, fetchImpl: Fetch = fetch) {
  const url = `${YOUTUBE_API}/channels?part=snippet,statistics,contentDetails&mine=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal, cache: "no-store" });
    const body = await res.json().catch(() => null);
    const parsed = parseChannel(body);
    if (!res.ok && parsed.ok) return { ok: false as const, status: res.status, error: `HTTP ${res.status}` };
    return parsed.ok ? parsed : { ...parsed, status: res.status };
  } catch (error) {
    return networkFailure(error);
  } finally {
    clearTimeout(timer);
  }
}
