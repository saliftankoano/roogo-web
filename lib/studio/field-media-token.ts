// Signed stream links for field media (server only). HMAC-SHA256 over the
// media id and the expiry, so a link opens one file only, until it expires,
// and cannot be extended. Pure, so it is tested without the app's aliases.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Stream links handed to HeyGen and other renderers: 3 hours by default, 24 at most. */
export const DEFAULT_STREAM_TTL_SECONDS = 3 * 60 * 60;
export const MAX_STREAM_TTL_SECONDS = 24 * 60 * 60;

function tokenPayload(mediaId: string, exp: number): string {
  return `studio-field-media:v1:${mediaId}:${exp}`;
}

export function signMediaToken(secret: string, mediaId: string, exp: number): string {
  if (!secret) throw new Error("missing media token secret");
  return createHmac("sha256", secret).update(tokenPayload(mediaId, exp)).digest("base64url");
}

export function verifyMediaToken(
  secret: string,
  mediaId: string,
  exp: string | number | null | undefined,
  token: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !token || exp == null || exp === "") return false;
  const expiry = typeof exp === "number" ? exp : Number(exp);
  if (!Number.isInteger(expiry) || expiry < nowSeconds) return false;
  if (expiry - nowSeconds > MAX_STREAM_TTL_SECONDS + 60) return false;
  const expected = Buffer.from(signMediaToken(secret, mediaId, expiry));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function streamTtl(ttlSeconds?: number): number {
  if (ttlSeconds == null || !Number.isFinite(ttlSeconds)) return DEFAULT_STREAM_TTL_SECONDS;
  return Math.min(MAX_STREAM_TTL_SECONDS, Math.max(60, Math.floor(ttlSeconds)));
}
