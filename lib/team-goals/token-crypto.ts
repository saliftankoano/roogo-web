// Encryption at rest for social account tokens (table social_tokens,
// migration 100). AES-256-GCM with SOCIAL_TOKENS_KEY: 32 random bytes, base64
// (generate with `openssl rand -base64 32`). Without the key, nothing is
// stored: connecting TikTok refuses with a clear message.
//
// Stored form: "v1:<iv>:<tag>:<ciphertext>", each part base64url.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function tokenKey(env: Record<string, string | undefined>): Buffer | null {
  const raw = env.SOCIAL_TOKENS_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function sealToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

/** The token, or null when the value is not ours or the key is wrong (never throws). */
export function openToken(sealed: string, key: Buffer): string | null {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
