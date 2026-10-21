// Read-only access to the TikTok token stored by PR #78 (table social_tokens,
// migration 100, AES-256-GCM with SOCIAL_TOKENS_KEY). This branch does not
// depend on that PR compiling: when the table is missing, TikTok publishing
// simply stays off with a French reason.
//
// Publishing gets its access token from getFreshTikTokAccess (lib/team-goals/
// tiktok-store.ts), which renews it when it is close to its 24-hour expiry.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getFreshTikTokAccess } from "@/lib/team-goals/tiktok-store";
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

/** A usable access token for publishing (renewed when close to expiry), or the French reason. The token is never logged. */
export async function tiktokAccessToken(now = new Date()): Promise<{ token: string } | { error: string }> {
  const info = await tiktokPublishStatus();
  if (!info.enabled) return { error: info.reason ?? "TikTok n'est pas disponible." };
  const access = await getFreshTikTokAccess(now);
  if (!access.ok) return { error: access.error };
  if (!hasScope(access.scope, requiredScope(info.mode))) return { error: info.reason ?? "Permission TikTok manquante." };
  return { token: access.token };
}
