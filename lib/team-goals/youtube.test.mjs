import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import {
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  REFRESH_MARGIN_MS,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
  buildAuthorizeUrl,
  exchangeCode,
  fetchYouTubeChannel,
  hasScope,
  looksLikeTestingMode,
  newOAuthSecrets,
  parseChannel,
  parseTokenResponse,
  pkceChallenge,
  refreshTokens,
  revokeToken,
  tokenAction,
  youtubeConfig,
} from "./youtube.ts";
import { openToken, sealToken, tokenKey } from "./token-crypto.ts";

const NOW = new Date("2026-10-23T02:00:00Z");
const CONFIG = { clientId: "cid.apps.googleusercontent.com", clientSecret: "GOCSPX-secret-value", redirectUri: "https://roogobf.com/api/admin/social/youtube/callback" };
const TOKEN_BODY = {
  access_token: "ya29.ACCESS-SECRET",
  expires_in: 3599,
  refresh_token: "1//REFRESH-SECRET",
  scope: `${YOUTUBE_UPLOAD_SCOPE} ${YOUTUBE_READONLY_SCOPE}`,
  token_type: "Bearer",
};

function fakeFetch(status, body, seen) {
  return async (url, init) => {
    seen?.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

describe("youtubeConfig and the authorize URL", () => {
  it("needs both keys and defaults the redirect to the site callback", () => {
    assert.equal(youtubeConfig({ YOUTUBE_CLIENT_ID: "x" }, "https://roogobf.com"), null);
    assert.equal(youtubeConfig({ YOUTUBE_CLIENT_ID: " ", YOUTUBE_CLIENT_SECRET: "s" }, "https://roogobf.com"), null);
    const cfg = youtubeConfig({ YOUTUBE_CLIENT_ID: " id ", YOUTUBE_CLIENT_SECRET: "s" }, "https://roogobf.com/");
    assert.deepEqual(cfg, { clientId: "id", clientSecret: "s", redirectUri: "https://roogobf.com/api/admin/social/youtube/callback" });
    const custom = youtubeConfig({ YOUTUBE_CLIENT_ID: "id", YOUTUBE_CLIENT_SECRET: "s", YOUTUBE_REDIRECT_URI: "https://preview.roogobf.com/cb" }, "https://x");
    assert.equal(custom.redirectUri, "https://preview.roogobf.com/cb");
  });

  it("asks for readonly and upload, offline access, consent every time, state and an S256 PKCE challenge", () => {
    const { state, verifier, challenge } = newOAuthSecrets();
    assert.ok(state.length >= 32 && verifier.length >= 43);
    assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
    const url = new URL(buildAuthorizeUrl(CONFIG, state, challenge));
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    assert.equal(p.get("client_id"), CONFIG.clientId);
    assert.equal(p.get("redirect_uri"), CONFIG.redirectUri);
    assert.equal(p.get("response_type"), "code");
    assert.equal(p.get("scope"), YOUTUBE_SCOPE);
    assert.deepEqual(p.get("scope").split(" ").sort(), [YOUTUBE_READONLY_SCOPE, YOUTUBE_UPLOAD_SCOPE].sort());
    assert.equal(p.get("access_type"), "offline");
    assert.equal(p.get("prompt"), "consent");
    assert.equal(p.get("state"), state);
    assert.equal(p.get("code_challenge"), challenge);
    assert.equal(p.get("code_challenge_method"), "S256");
    assert.ok(!url.toString().includes(CONFIG.clientSecret), "the client secret never goes to the browser");
  });

  it("two connections never share a state or a verifier", () => {
    const a = newOAuthSecrets();
    const b = newOAuthSecrets();
    assert.notEqual(a.state, b.state);
    assert.notEqual(a.verifier, b.verifier);
  });

  it("matches the RFC 7636 example challenge", () => {
    assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("token answers", () => {
  it("turns expires_in into an absolute time and keeps the granted scope", () => {
    const t = parseTokenResponse(TOKEN_BODY, NOW);
    assert.equal(t.ok, true);
    assert.equal(t.accessToken, "ya29.ACCESS-SECRET");
    assert.equal(t.refreshToken, "1//REFRESH-SECRET");
    assert.equal(t.accessExpiresAt, new Date(NOW.getTime() + 3599 * 1000).toISOString());
    assert.equal(t.refreshExpiresAt, null);
    assert.ok(hasScope(t.scope, YOUTUBE_UPLOAD_SCOPE) && hasScope(t.scope, YOUTUBE_READONLY_SCOPE));
    assert.equal(hasScope(YOUTUBE_READONLY_SCOPE, YOUTUBE_UPLOAD_SCOPE), false);
  });

  it("the code exchange needs a refresh token; a refresh does not", () => {
    const { refresh_token, ...noRefresh } = TOKEN_BODY;
    assert.ok(refresh_token);
    const first = parseTokenResponse(noRefresh, NOW, true);
    assert.equal(first.ok, false);
    assert.equal(first.code, "no_refresh_token");
    const later = parseTokenResponse(noRefresh, NOW, false);
    assert.equal(later.ok, true);
    assert.equal(later.refreshToken, "");
  });

  it("records when Google says the refresh token expires (apps in Testing)", () => {
    const t = parseTokenResponse({ ...TOKEN_BODY, refresh_token_expires_in: 604799 }, NOW);
    assert.equal(t.refreshExpiresAt, new Date(NOW.getTime() + 604799 * 1000).toISOString());
    assert.equal(looksLikeTestingMode(t.refreshExpiresAt, NOW.toISOString()), true);
    assert.equal(looksLikeTestingMode(null, NOW.toISOString()), false);
    assert.equal(looksLikeTestingMode(new Date(NOW.getTime() + 60 * 86400000).toISOString(), NOW.toISOString()), false);
  });

  it("explains invalid_grant in French with the 7-day Testing limit, never echoing a token", () => {
    const r = parseTokenResponse({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, NOW);
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_grant");
    assert.match(r.error, /reconnecter YouTube/);
    assert.match(r.error, /7 jours/);
    assert.equal(parseTokenResponse({ access_token: "a" }, NOW).ok, false);
    assert.equal(parseTokenResponse(null, NOW).ok, false);
  });
});

describe("refresh decision", () => {
  it("uses a token with more than 10 minutes left, refreshes otherwise", () => {
    const later = (ms) => new Date(NOW.getTime() + ms).toISOString();
    assert.equal(tokenAction({ accessExpiresAt: later(REFRESH_MARGIN_MS + 60_000), refreshExpiresAt: null }, NOW), "use");
    assert.equal(tokenAction({ accessExpiresAt: later(REFRESH_MARGIN_MS - 60_000), refreshExpiresAt: null }, NOW), "refresh");
    assert.equal(tokenAction({ accessExpiresAt: later(-1000), refreshExpiresAt: null }, NOW), "refresh");
    assert.equal(tokenAction({ accessExpiresAt: later(-1000), refreshExpiresAt: later(-1) }, NOW), "reconnect");
  });
});

describe("HTTP calls with an injected fetch", () => {
  it("exchanges the code with the PKCE verifier as a form post", async () => {
    const seen = [];
    const t = await exchangeCode(CONFIG, "4/CODE", "VERIFIER", fakeFetch(200, TOKEN_BODY, seen), NOW);
    assert.equal(t.ok, true);
    assert.equal(seen[0].url, GOOGLE_TOKEN_URL);
    assert.equal(seen[0].init.method, "POST");
    const form = new URLSearchParams(seen[0].init.body);
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(form.get("code"), "4/CODE");
    assert.equal(form.get("code_verifier"), "VERIFIER");
    assert.equal(form.get("redirect_uri"), CONFIG.redirectUri);
  });

  it("refreshes with the refresh token and keeps working when Google sends no new one", async () => {
    const seen = [];
    const { refresh_token, ...body } = TOKEN_BODY;
    assert.ok(refresh_token);
    const t = await refreshTokens(CONFIG, "1//OLD", fakeFetch(200, body, seen), NOW);
    assert.equal(t.ok, true);
    assert.equal(t.refreshToken, "");
    const form = new URLSearchParams(seen[0].init.body);
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), "1//OLD");
  });

  it("a refused refresh comes back as a French failure with the HTTP status", async () => {
    const t = await refreshTokens(CONFIG, "1//OLD", fakeFetch(400, { error: "invalid_grant", error_description: "Bad Request" }), NOW);
    assert.equal(t.ok, false);
    assert.equal(t.status, 400);
    assert.match(t.error, /Autorisation Google expirée/);
  });

  it("network errors never throw", async () => {
    const t = await refreshTokens(CONFIG, "x", async () => { throw new Error("ECONNRESET"); }, NOW);
    assert.equal(t.ok, false);
    assert.match(t.error, /Erreur réseau/);
  });

  it("revokes at Google's revoke endpoint", async () => {
    const seen = [];
    assert.equal(await revokeToken("1//R", fakeFetch(200, {}, seen)), true);
    assert.equal(seen[0].url, GOOGLE_REVOKE_URL);
    assert.equal(new URLSearchParams(seen[0].init.body).get("token"), "1//R");
    assert.equal(await revokeToken("1//R", async () => { throw new Error("down"); }), false);
  });
});

describe("channel statistics", () => {
  const CHANNEL = {
    items: [
      {
        id: "UC123",
        snippet: { title: "Roogo Burkina", customUrl: "@roogoburkina", thumbnails: { default: { url: "https://yt3.ggpht.com/a.jpg" } } },
        statistics: { subscriberCount: "123", hiddenSubscriberCount: false, videoCount: "45", viewCount: "67890" },
        contentDetails: { relatedPlaylists: { uploads: "UU123" } },
      },
    ],
  };

  it("parses subscribers, videos, views and the uploads playlist", () => {
    const c = parseChannel(CHANNEL);
    assert.equal(c.ok, true);
    assert.deepEqual(
      { id: c.channelId, title: c.title, handle: c.handle, subs: c.subscriberCount, videos: c.videoCount, views: c.viewCount, uploads: c.uploadsPlaylistId },
      { id: "UC123", title: "Roogo Burkina", handle: "roogoburkina", subs: 123, videos: 45, views: 67890, uploads: "UU123" },
    );
  });

  it("a hidden count is null, a Google account without a channel is named", () => {
    const hidden = structuredClone(CHANNEL);
    hidden.items[0].statistics.hiddenSubscriberCount = true;
    assert.equal(parseChannel(hidden).subscriberCount, null);
    const none = parseChannel({ items: [] });
    assert.equal(none.ok, false);
    assert.equal(none.code, "no_channel");
    const quota = parseChannel({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } });
    assert.equal(quota.code, "quotaExceeded");
  });

  it("reads channels.list?mine=true with the token in the header only", async () => {
    const seen = [];
    const c = await fetchYouTubeChannel("ya29.SECRET", fakeFetch(200, CHANNEL, seen));
    assert.equal(c.ok, true);
    assert.equal(seen[0].url, "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true");
    assert.equal(seen[0].init.headers.Authorization, "Bearer ya29.SECRET");
    assert.ok(!seen[0].url.includes("SECRET"));
    const denied = await fetchYouTubeChannel("x", fakeFetch(401, { error: { code: 401, message: "Invalid Credentials", errors: [{ reason: "authError" }] } }));
    assert.equal(denied.ok, false);
    assert.equal(denied.status, 401);
  });
});

describe("token sealing (SOCIAL_TOKENS_KEY)", () => {
  it("YouTube tokens are stored sealed and come back only with the right key", () => {
    const key = randomBytes(32);
    const env = { SOCIAL_TOKENS_KEY: key.toString("base64") };
    assert.ok(tokenKey(env));
    const sealed = sealToken(TOKEN_BODY.refresh_token, tokenKey(env));
    assert.ok(sealed.startsWith("v1:"), "matches social_tokens_sealed_check");
    assert.ok(!sealed.includes("REFRESH-SECRET"));
    assert.equal(openToken(sealed, key), TOKEN_BODY.refresh_token);
    assert.equal(openToken(sealed, randomBytes(32)), null);
  });
});
