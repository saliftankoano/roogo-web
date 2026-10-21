import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import {
  REFRESH_MARGIN_MS,
  TIKTOK_TOKEN_URL,
  buildAuthorizeUrl,
  exchangeCode,
  fetchTikTokProfile,
  hasStatsScope,
  parseTokenResponse,
  parseUserInfo,
  refreshTokens,
  tiktokConfig,
  tokenAction,
} from "./tiktok.ts";
import { openToken, sealToken, tokenKey } from "./token-crypto.ts";

const NOW = new Date("2026-10-18T02:00:00Z");
const CONFIG = { clientKey: "ck_test", clientSecret: "cs_secret_value", redirectUri: "https://roogobf.com/api/admin/social/tiktok/callback" };
const TOKEN_BODY = {
  access_token: "act.access-secret",
  expires_in: 86400,
  open_id: "open-123",
  refresh_token: "rft.refresh-secret",
  refresh_expires_in: 31536000,
  scope: "user.info.basic,user.info.stats",
  token_type: "Bearer",
};

function fakeFetch(status, body, seen) {
  return async (url, init) => {
    seen?.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

describe("tiktokConfig and the authorize URL", () => {
  it("needs both keys and defaults the redirect to the site callback", () => {
    assert.equal(tiktokConfig({ TIKTOK_CLIENT_KEY: "k" }, "https://roogobf.com"), null);
    assert.deepEqual(tiktokConfig({ TIKTOK_CLIENT_KEY: " k ", TIKTOK_CLIENT_SECRET: "s" }, "https://roogobf.com/"), {
      clientKey: "k", clientSecret: "s", redirectUri: "https://roogobf.com/api/admin/social/tiktok/callback",
    });
    assert.equal(tiktokConfig({ TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s", TIKTOK_REDIRECT_URI: "https://www.roogobf.com/x" }, "http://localhost:3000").redirectUri, "https://www.roogobf.com/x");
  });
  it("asks for user.info.stats with a state and never carries the secret", () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, "st4te"));
    assert.equal(url.origin + url.pathname, "https://www.tiktok.com/v2/auth/authorize/");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), "st4te");
    assert.ok(hasStatsScope(url.searchParams.get("scope")));
    assert.equal(url.searchParams.get("redirect_uri"), CONFIG.redirectUri);
    assert.doesNotMatch(url.toString(), /cs_secret_value/);
  });
});

describe("parseTokenResponse", () => {
  it("turns lifetimes into absolute times", () => {
    const t = parseTokenResponse(TOKEN_BODY, NOW);
    assert.equal(t.ok, true);
    assert.equal(t.accessExpiresAt, "2026-10-19T02:00:00.000Z");
    assert.equal(t.refreshExpiresAt, "2027-10-18T02:00:00.000Z");
    assert.equal(t.openId, "open-123");
  });
  it("reports TikTok's OAuth error with its log id", () => {
    const t = parseTokenResponse({ error: "invalid_grant", error_description: "Refresh token is invalid or expired.", log_id: "L1" }, NOW);
    assert.equal(t.ok, false);
    assert.equal(t.code, "invalid_grant");
    assert.match(t.error, /invalid_grant.*\(log L1\)/);
  });
  it("refuses an answer without tokens", () => {
    assert.equal(parseTokenResponse({ expires_in: 10 }, NOW).ok, false);
    assert.equal(parseTokenResponse(null, NOW).ok, false);
  });
  it("detects whether the stats scope was granted", () => {
    assert.equal(hasStatsScope("user.info.basic"), false);
    assert.equal(hasStatsScope("user.info.basic,user.info.stats"), true);
  });
});

describe("tokenAction (refresh logic)", () => {
  const at = (ms) => new Date(NOW.getTime() + ms).toISOString();
  it("uses a token with more than 10 minutes left", () => {
    assert.equal(tokenAction({ accessExpiresAt: at(REFRESH_MARGIN_MS + 1000), refreshExpiresAt: at(1e10) }, NOW), "use");
  });
  it("refreshes a token about to expire or expired", () => {
    assert.equal(tokenAction({ accessExpiresAt: at(60_000), refreshExpiresAt: at(1e10) }, NOW), "refresh");
    assert.equal(tokenAction({ accessExpiresAt: at(-86400000), refreshExpiresAt: null }, NOW), "refresh");
  });
  it("asks for a reconnection once the 365-day refresh token is over", () => {
    assert.equal(tokenAction({ accessExpiresAt: at(-1000), refreshExpiresAt: at(-1) }, NOW), "reconnect");
  });
});

describe("token calls (no network)", () => {
  it("refresh posts a form with grant_type refresh_token and keeps TikTok's new refresh token", async () => {
    const seen = [];
    const body = { ...TOKEN_BODY, refresh_token: "rft.new-one" };
    const t = await refreshTokens(CONFIG, "rft.old", fakeFetch(200, body, seen), NOW);
    assert.equal(t.ok, true);
    assert.equal(t.refreshToken, "rft.new-one");
    assert.equal(seen[0].url, TIKTOK_TOKEN_URL);
    assert.equal(seen[0].init.method, "POST");
    assert.equal(seen[0].init.headers["Content-Type"], "application/x-www-form-urlencoded");
    const form = new URLSearchParams(seen[0].init.body);
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), "rft.old");
    assert.equal(form.get("client_key"), "ck_test");
  });
  it("code exchange sends the code and the same redirect URI", async () => {
    const seen = [];
    await exchangeCode(CONFIG, "c0de", fakeFetch(200, TOKEN_BODY, seen), NOW);
    const form = new URLSearchParams(seen[0].init.body);
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(form.get("code"), "c0de");
    assert.equal(form.get("redirect_uri"), CONFIG.redirectUri);
  });
  it("a refused refresh names the status and code, never a token or the secret", async () => {
    const t = await refreshTokens(CONFIG, "rft.old", fakeFetch(400, { error: "invalid_grant", error_description: "expired", log_id: "x" }), NOW);
    assert.equal(t.ok, false);
    assert.equal(t.status, 400);
    assert.doesNotMatch(JSON.stringify(t), /rft\.old|cs_secret_value/);
  });
  it("a network failure does not throw", async () => {
    const t = await refreshTokens(CONFIG, "r", async () => { throw new Error("ECONNRESET"); }, NOW);
    assert.equal(t.ok, false);
    assert.match(t.error, /ECONNRESET/);
  });
});

describe("user info parsing", () => {
  const ok = { data: { user: { open_id: "o", display_name: "Roogo", follower_count: 1520 } }, error: { code: "ok", message: "", log_id: "l" } };
  it("reads follower_count", () => {
    assert.deepEqual(parseUserInfo(ok), { ok: true, openId: "o", displayName: "Roogo", followerCount: 1520 });
  });
  it("reports a Display API error object", () => {
    const r = parseUserInfo({ data: {}, error: { code: "scope_not_authorized", message: "no stats", log_id: "z" } });
    assert.equal(r.ok, false);
    assert.equal(r.code, "scope_not_authorized");
  });
  it("refuses a missing or odd count", () => {
    for (const v of [undefined, -1, 1.5, "abc"]) assert.equal(parseUserInfo({ data: { user: { follower_count: v } }, error: { code: "ok" } }).ok, false);
    assert.equal(parseUserInfo({ data: { user: { follower_count: "42" } }, error: { code: "ok" } }).followerCount, 42);
  });
  it("sends the token as a Bearer header and asks for follower_count", async () => {
    const seen = [];
    const r = await fetchTikTokProfile("act.abc", fakeFetch(200, ok, seen));
    assert.equal(r.ok, true);
    assert.match(seen[0].url, /fields=open_id,display_name,follower_count/);
    assert.equal(seen[0].init.headers.Authorization, "Bearer act.abc");
    assert.doesNotMatch(seen[0].url, /act\.abc/);
  });
  it("an HTTP 401 without a body is a failure", async () => {
    const r = await fetchTikTokProfile("act.abc", fakeFetch(401, null));
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
  });
});

describe("token encryption at rest", () => {
  const key = randomBytes(32);
  it("round-trips and never stores the plain token", () => {
    const sealed = sealToken("rft.refresh-secret", key);
    assert.match(sealed, /^v1:/);
    assert.doesNotMatch(sealed, /refresh-secret/);
    assert.equal(openToken(sealed, key), "rft.refresh-secret");
  });
  it("returns null with the wrong key or a tampered value", () => {
    const sealed = sealToken("x", key);
    assert.equal(openToken(sealed, randomBytes(32)), null);
    assert.equal(openToken(sealed.slice(0, -2) + "AA", key), null);
    assert.equal(openToken("plain", key), null);
  });
  it("accepts only a 32-byte base64 key", () => {
    assert.equal(tokenKey({}), null);
    assert.equal(tokenKey({ SOCIAL_TOKENS_KEY: Buffer.from("short").toString("base64") }), null);
    assert.equal(tokenKey({ SOCIAL_TOKENS_KEY: key.toString("base64") }).length, 32);
  });
});

describe("TikTok joins the automatic readings only when connected", async () => {
  const { metricDefFor, readingSourceLabel } = await import("./core.ts");
  it("stays manual until the account is connected", () => {
    assert.match(metricDefFor("tiktok_followers").measure, /saisi à la main/);
    assert.equal(metricDefFor("tiktok_followers", { tiktokConnected: true }).source, "Lu chaque nuit");
    assert.equal(metricDefFor("tiktok_followers", { tiktokConnected: true }).manual, true);
    assert.equal(metricDefFor("facebook_followers", { tiktokConnected: true }).source, "Lu chaque nuit");
  });
  it("labels an automatic TikTok reading", () => {
    assert.equal(readingSourceLabel("tiktok_followers", "automatique", null), "Lu automatiquement sur TikTok");
  });
});
