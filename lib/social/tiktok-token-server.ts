// Read-only access to the TikTok token stored by PR #78 (table social_tokens,
// migration 100, AES-256-GCM with SOCIAL_TOKENS_KEY). This branch does not
// depend on that PR compiling: when the table is missing, TikTok publishing
// simply stays off with a French reason.
//
// TODO(after PR #78 merges): replace openSealedToken with openToken from
// lib/team-goals/token-crypto.ts, and call the store's refresh helper (the
// one readTikTokFollowers uses: refreshTokens + sealed, saving TikTok's new
// refresh token) instead of refusing an expired access token. TikTok access
// tokens live 24 hours; until then a publish needs a token refreshed by the
// nightly reading less than 24 hours earlier. Also add video.publish (or
// video.upload for TIKTOK_POST_MODE=draft) to TIKTOK_SCOPE in
// lib/team-goals/tiktok.ts and reconnect TikTok once.

import { createDecipheriv } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasScope, requiredScope, tiktokPostMode, tiktokPublishInfo, type TikTokPublishInfo } from "./tiktok-publish";

type TokenRow = { scope: string | null; access_token_enc: string; access_expires_at: string };

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205" || (/social_tokens/.test(message) && /does not exist|schema cache/.test(message));
}

function tokensKey(): Buffer | null {
  const raw = process.env.SOCIAL_TOKENS_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

/** Same format as lib/team-goals/token-crypto.ts (PR #78): "v1:<iv>:<tag>:<data>", base64url. Never throws. */
function openSealedToken(sealed: string, key: Buffer): string | null {
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

async function loadRow(): Promise<{ row: TokenRow | null; tableReady: boolean }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("social_tokens")
      .select("scope, access_token_enc, access_expires_at")
      .eq("provider", "tiktok")
      .maybeSingle();
    if (error) {
      if (!isMissingTable(error)) console.error("[tiktok-publish] token row read failed", { code: error.code, message: error.message });
      return { row: null, tableReady: !isMissingTable(error) };
    }
    return { row: (data as TokenRow | null) ?? null, tableReady: true };
  } catch (error) {
    console.error("[tiktok-publish] token row read failed", { message: error instanceof Error ? error.message : String(error) });
    return { row: null, tableReady: false };
  }
}

/** Whether a validated video may target TikTok, with the French reason when not. Never throws. */
export async function tiktokPublishStatus(): Promise<TikTokPublishInfo> {
  const mode = tiktokPostMode(process.env);
  const clientKey = Boolean(process.env.TIKTOK_CLIENT_KEY?.trim());
  // Feature flag: no TikTok key, no database read at all.
  if (!clientKey) return tiktokPublishInfo({ clientKey, tokensKey: false, tableReady: false, connected: false, scope: null, mode });
  const { row, tableReady } = await loadRow();
  return tiktokPublishInfo({ clientKey, tokensKey: Boolean(tokensKey()), tableReady, connected: Boolean(row), scope: row?.scope ?? null, mode });
}

/** A usable access token for publishing, or the French reason. The token is never logged. */
export async function tiktokAccessToken(now = new Date()): Promise<{ token: string } | { error: string }> {
  const info = await tiktokPublishStatus();
  if (!info.enabled) return { error: info.reason ?? "TikTok n'est pas disponible." };
  const key = tokensKey();
  const { row } = await loadRow();
  if (!key || !row) return { error: "Le compte TikTok n'est pas connecté." };
  if (!hasScope(row.scope, requiredScope(info.mode))) return { error: info.reason ?? "Permission TikTok manquante." };
  if (new Date(row.access_expires_at).getTime() - now.getTime() < 2 * 60_000) {
    return { error: "Le jeton TikTok a expiré : il est renouvelé chaque nuit, réessayez après la prochaine lecture ou reconnectez TikTok." };
  }
  const token = openSealedToken(row.access_token_enc, key);
  if (!token) return { error: "Jeton TikTok illisible (SOCIAL_TOKENS_KEY a changé ?) : reconnectez TikTok." };
  return { token };
}
