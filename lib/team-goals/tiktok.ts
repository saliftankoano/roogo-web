// TikTok follower count of @roogo.226 for « Nos objectifs », through TikTok's
// official API only (never the website):
// - Login Kit for Web: the account owner authorizes once, scope user.info.stats
//   https://developers.tiktok.com/doc/login-kit-web
// - Tokens: POST /v2/oauth/token/ (authorization_code, refresh_token); access
//   token valid 24 hours, refresh token 365 days, a refresh may return a new
//   refresh token that replaces the old one
//   https://developers.tiktok.com/doc/oauth-user-access-token-management
// - Display API: GET /v2/user/info/?fields=open_id,display_name,follower_count
//   (follower_count needs user.info.stats)
//   https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info
//
// No imports: parsing, the refresh decision and the HTTP calls (with an
// injected fetch) are tested with node:test (tiktok.test.mjs). Tokens and the
// client secret are never logged; errors carry the HTTP status and TikTok's
// error code and log_id only.
//
// Env (server only): TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and optionally
// TIKTOK_REDIRECT_URI (default: <site>/api/admin/social/tiktok/callback).

export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
export const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
export const TIKTOK_SCOPE = "user.info.basic,user.info.stats";
export const TIKTOK_CALLBACK_PATH = "/api/admin/social/tiktok/callback";
/** Refresh the access token when it has less than this left. */
export const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10_000;

export type TikTokConfig = { clientKey: string; clientSecret: string; redirectUri: string };

/** The app's keys from the env, or null when TikTok is not set up. */
export function tiktokConfig(
  env: Record<string, string | undefined>,
  origin: string,
): TikTokConfig | null {
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret) return null;
  const redirectUri = env.TIKTOK_REDIRECT_URI?.trim() || `${origin.replace(/\/$/, "")}${TIKTOK_CALLBACK_PATH}`;
  return { clientKey, clientSecret, redirectUri };
}

/** The TikTok page where the account owner says yes. `state` protects against CSRF. */
export function buildAuthorizeUrl(config: Pick<TikTokConfig, "clientKey" | "redirectUri">, state: string): string {
  const params = new URLSearchParams({
    client_key: config.clientKey,
    response_type: "code",
    scope: TIKTOK_SCOPE,
    redirect_uri: config.redirectUri,
    state,
    // Always show the consent page, so the right account is chosen.
    disable_auto_auth: "1",
  });
  return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
}

export type TikTokTokens = {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string | null;
  openId: string | null;
  scope: string;
};

export type TikTokFailure = { ok: false; error: string; status?: number; code?: string };

/** TikTok's error as « code: description (log_id) », or null when the body is not an error. */
export function tiktokErrorOf(body: unknown): { code: string; message: string } | null {
  const b = body as { error?: unknown; error_description?: unknown; log_id?: unknown } | null;
  if (!b || typeof b !== "object") return null;
  // OAuth endpoints: { error: "invalid_request", error_description, log_id }.
  if (typeof b.error === "string" && b.error) {
    const desc = typeof b.error_description === "string" ? b.error_description.slice(0, 200) : "";
    const log = typeof b.log_id === "string" ? ` (log ${b.log_id})` : "";
    return { code: b.error, message: `${desc}${log}`.trim() };
  }
  // Display API: { error: { code: "ok" | "...", message, log_id } }.
  const e = b.error as { code?: unknown; message?: unknown; log_id?: unknown } | undefined;
  if (e && typeof e === "object" && typeof e.code === "string" && e.code !== "ok") {
    const log = typeof e.log_id === "string" ? ` (log ${e.log_id})` : "";
    return { code: e.code, message: `${typeof e.message === "string" ? e.message.slice(0, 200) : ""}${log}`.trim() };
  }
  return null;
}

/** Tokens from a /v2/oauth/token/ answer, with absolute expiry times. */
export function parseTokenResponse(body: unknown, now: Date): ({ ok: true } & TikTokTokens) | TikTokFailure {
  const err = tiktokErrorOf(body);
  if (err) return { ok: false, code: err.code, error: `TikTok ${err.code}: ${err.message}` };
  const b = (body ?? {}) as Record<string, unknown>;
  const access = typeof b.access_token === "string" ? b.access_token : "";
  const refresh = typeof b.refresh_token === "string" ? b.refresh_token : "";
  const expiresIn = Number(b.expires_in);
  if (!access || !refresh || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return { ok: false, error: "Réponse TikTok incomplète (jeton absent)" };
  }
  const refreshIn = Number(b.refresh_expires_in);
  return {
    ok: true,
    accessToken: access,
    accessExpiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    refreshToken: refresh,
    refreshExpiresAt: Number.isFinite(refreshIn) && refreshIn > 0 ? new Date(now.getTime() + refreshIn * 1000).toISOString() : null,
    openId: typeof b.open_id === "string" ? b.open_id : null,
    scope: typeof b.scope === "string" ? b.scope : "",
  };
}

/** True when the follower count was granted (the person can untick scopes). */
export function hasStatsScope(scope: string): boolean {
  return scope.split(/[,\s]+/).includes("user.info.stats");
}

/** What to do with stored tokens before reading: use, refresh, or ask the owner to reconnect. */
export function tokenAction(
  stored: { accessExpiresAt: string; refreshExpiresAt: string | null },
  now: Date,
): "use" | "refresh" | "reconnect" {
  const t = now.getTime();
  if (Date.parse(stored.accessExpiresAt) - t > REFRESH_MARGIN_MS) return "use";
  if (stored.refreshExpiresAt && Date.parse(stored.refreshExpiresAt) <= t) return "reconnect";
  return "refresh";
}

type Fetch = typeof fetch;

async function postForm(url: string, form: Record<string, string>, fetchImpl: Fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
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

function networkFailure(error: unknown): TikTokFailure {
  const aborted = error instanceof Error && error.name === "AbortError";
  return { ok: false, error: aborted ? `Pas de réponse de TikTok en ${TIMEOUT_MS / 1000} s` : `Erreur réseau: ${error instanceof Error ? error.message : String(error)}` };
}

async function tokenCall(form: Record<string, string>, fetchImpl: Fetch, now: Date) {
  try {
    const { res, body } = await postForm(TIKTOK_TOKEN_URL, form, fetchImpl);
    const parsed = parseTokenResponse(body, now);
    if (!res.ok && parsed.ok) return { ok: false as const, status: res.status, error: `HTTP ${res.status}` };
    return parsed.ok ? parsed : { ...parsed, status: res.status };
  } catch (error) {
    return networkFailure(error);
  }
}

/** Exchanges the code from the callback for tokens. */
export function exchangeCode(config: TikTokConfig, code: string, fetchImpl: Fetch = fetch, now = new Date()) {
  return tokenCall(
    {
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    },
    fetchImpl,
    now,
  );
}

/** A new access token (and maybe a new refresh token, which then replaces the old one). */
export function refreshTokens(config: Pick<TikTokConfig, "clientKey" | "clientSecret">, refreshToken: string, fetchImpl: Fetch = fetch, now = new Date()) {
  return tokenCall(
    {
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    fetchImpl,
    now,
  );
}

/** Revokes the access token (disconnect). Never throws. */
export async function revokeToken(config: Pick<TikTokConfig, "clientKey" | "clientSecret">, accessToken: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  try {
    const { res } = await postForm(TIKTOK_REVOKE_URL, { client_key: config.clientKey, client_secret: config.clientSecret, token: accessToken }, fetchImpl);
    return res.ok;
  } catch {
    return false;
  }
}

export type TikTokProfile = { openId: string | null; displayName: string | null; followerCount: number };

/** follower_count (and the display name) from a /v2/user/info/ answer. */
export function parseUserInfo(body: unknown): ({ ok: true } & TikTokProfile) | TikTokFailure {
  const err = tiktokErrorOf(body);
  if (err) return { ok: false, code: err.code, error: `TikTok ${err.code}: ${err.message}` };
  const user = (body as { data?: { user?: Record<string, unknown> } } | null)?.data?.user;
  const raw = user?.follower_count;
  const n = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 1_000_000_000) {
    return { ok: false, error: "follower_count absent de la réponse TikTok" };
  }
  return {
    ok: true,
    openId: typeof user?.open_id === "string" ? user.open_id : null,
    displayName: typeof user?.display_name === "string" ? user.display_name.slice(0, 80) : null,
    followerCount: n,
  };
}

/** Reads the follower count with an access token. Never throws. */
export async function fetchTikTokProfile(accessToken: string, fetchImpl: Fetch = fetch) {
  const url = `${TIKTOK_USER_INFO_URL}?fields=open_id,display_name,follower_count`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal, cache: "no-store" });
    const body = await res.json().catch(() => null);
    const parsed = parseUserInfo(body);
    if (!res.ok && parsed.ok) return { ok: false as const, status: res.status, error: `HTTP ${res.status}` };
    return parsed.ok ? parsed : { ...parsed, status: res.status };
  } catch (error) {
    return networkFailure(error);
  } finally {
    clearTimeout(timer);
  }
}
