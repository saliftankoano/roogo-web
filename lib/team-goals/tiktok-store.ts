// Server side of the TikTok connection: the social_tokens row (migration
// 100), token refresh before each nightly read, and the founder card status.
// Tokens are sealed with lib/team-goals/token-crypto.ts and never logged.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { openToken, sealToken, tokenKey } from "./token-crypto";
import {
  fetchTikTokProfile,
  refreshTokens,
  revokeToken,
  tiktokConfig,
  tokenAction,
  type TikTokProfile,
  type TikTokTokens,
} from "./tiktok";

const PROVIDER = "tiktok";

type Row = {
  provider: string;
  account_id: string | null;
  account_name: string | null;
  access_token_enc: string;
  access_expires_at: string;
  refresh_token_enc: string;
  refresh_expires_at: string | null;
  scope: string;
  connected_at: string;
  last_read_at: string | null;
  last_error: string | null;
};

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205" || (/social_tokens/.test(message) && /does not exist|schema cache/.test(message));
}

export function tiktokEnvConfig(origin: string) {
  return tiktokConfig(process.env, origin);
}

async function loadRow(): Promise<{ row: Row | null; tableMissing: boolean }> {
  const { data, error } = await supabaseAdmin.from("social_tokens").select("*").eq("provider", PROVIDER).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { row: null, tableMissing: true };
    throw error;
  }
  return { row: (data as Row | null) ?? null, tableMissing: false };
}

export type TikTokStatus = {
  /** TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and SOCIAL_TOKENS_KEY are all set. */
  configured: boolean;
  missing: string[];
  tableReady: boolean;
  connected: boolean;
  accountName: string | null;
  connectedAt: string | null;
  lastReadAt: string | null;
  lastError: string | null;
};

export async function getTikTokStatus(): Promise<TikTokStatus> {
  const missing = [
    !process.env.TIKTOK_CLIENT_KEY?.trim() && "TIKTOK_CLIENT_KEY",
    !process.env.TIKTOK_CLIENT_SECRET?.trim() && "TIKTOK_CLIENT_SECRET",
    !tokenKey(process.env) && "SOCIAL_TOKENS_KEY",
  ].filter((v): v is string => !!v);
  const { row, tableMissing } = await loadRow();
  return {
    configured: missing.length === 0,
    missing,
    tableReady: !tableMissing,
    connected: !!row,
    accountName: row?.account_name ?? null,
    connectedAt: row?.connected_at ?? null,
    lastReadAt: row?.last_read_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

/** True when a TikTok account is connected (false when the table is missing). */
export async function isTikTokConnected(): Promise<boolean> {
  try {
    return !!(await loadRow()).row;
  } catch {
    return false;
  }
}

function sealed(tokens: TikTokTokens, key: Buffer) {
  return {
    access_token_enc: sealToken(tokens.accessToken, key),
    access_expires_at: tokens.accessExpiresAt,
    refresh_token_enc: sealToken(tokens.refreshToken, key),
    refresh_expires_at: tokens.refreshExpiresAt,
    scope: tokens.scope,
  };
}

/** Stores a fresh connection (callback). Replaces any previous one. */
export async function saveTikTokConnection(tokens: TikTokTokens, profile: TikTokProfile | null, connectedBy: string) {
  const key = tokenKey(process.env);
  if (!key) throw new Error("SOCIAL_TOKENS_KEY missing or not 32 bytes");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("social_tokens").upsert({
    provider: PROVIDER,
    account_id: profile?.openId ?? tokens.openId,
    account_name: profile?.displayName ?? null,
    ...sealed(tokens, key),
    connected_by: connectedBy,
    connected_at: now,
    refreshed_at: now,
    last_read_at: null,
    last_error: null,
    updated_at: now,
  });
  if (error) throw error;
}

export type TikTokRead =
  | { state: "not connected" }
  | { state: "ok"; value: number }
  | { state: "failed"; error: string };

async function note(patch: Partial<Row> & Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("social_tokens").update({ ...patch, updated_at: new Date().toISOString() }).eq("provider", PROVIDER);
  if (error) console.error("[social-followers] TikTok row update failed", { code: error.code, message: error.message });
}

export type TikTokAccess = { ok: true; token: string; scope: string } | { ok: false; error: string; notConnected?: boolean };

/**
 * A usable TikTok access token, refreshed first when it has less than 10
 * minutes left (TikTok's new refresh token is saved too). Shared by the
 * nightly follower reading and Studio publishing, so a token is never refused
 * just because it is older than 24 hours. Never throws on TikTok errors; the
 * French reason is returned and stored in last_error. The token is never logged.
 */
export async function getFreshTikTokAccess(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<TikTokAccess> {
  const { row } = await loadRow();
  if (!row) return { ok: false, error: "Le compte TikTok n'est pas connecté.", notConnected: true };
  const key = tokenKey(process.env);
  const config = tiktokConfig(process.env, "https://roogobf.com");
  if (!key || !config) {
    return { ok: false, error: "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET ou SOCIAL_TOKENS_KEY manquant" };
  }
  const access = openToken(row.access_token_enc, key);
  const refresh = openToken(row.refresh_token_enc, key);
  if (!access || !refresh) {
    const error = "Jetons illisibles (SOCIAL_TOKENS_KEY a changé ?) : reconnecter TikTok";
    await note({ last_error: error });
    return { ok: false, error };
  }

  const action = tokenAction({ accessExpiresAt: row.access_expires_at, refreshExpiresAt: row.refresh_expires_at }, now);
  if (action === "reconnect") {
    const error = "Autorisation TikTok expirée (365 jours) : reconnecter TikTok";
    await note({ last_error: error });
    return { ok: false, error };
  }
  if (action === "refresh") {
    const next = await refreshTokens(config, refresh, fetchImpl, now);
    if (!next.ok) {
      const error = `Rafraîchissement refusé: ${next.error}`;
      await note({ last_error: error });
      return { ok: false, error };
    }
    await note({ ...sealed(next, key), refreshed_at: now.toISOString() });
    return { ok: true, token: next.accessToken, scope: next.scope || row.scope };
  }
  return { ok: true, token: access, scope: row.scope };
}

/**
 * The follower count for the nightly cron: gets a fresh access token (see
 * getFreshTikTokAccess), reads /v2/user/info/, and records the result on the
 * row. Never throws on TikTok errors; the reason is returned and stored in last_error.
 */
export async function readTikTokFollowers(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<TikTokRead> {
  const access = await getFreshTikTokAccess(now, fetchImpl);
  if (!access.ok) return access.notConnected ? { state: "not connected" } : { state: "failed", error: access.error };
  const { row } = await loadRow();
  const profile = await fetchTikTokProfile(access.token, fetchImpl);
  if (!profile.ok) {
    await note({ last_error: profile.error });
    return { state: "failed", error: profile.error };
  }
  await note({ last_read_at: now.toISOString(), last_error: null, account_name: profile.displayName ?? row?.account_name ?? null });
  return { state: "ok", value: profile.followerCount };
}

/** Revokes the token at TikTok (best effort) and deletes the row. */
export async function disconnectTikTok() {
  const { row } = await loadRow();
  if (!row) return;
  const key = tokenKey(process.env);
  const config = tiktokConfig(process.env, "https://roogobf.com");
  const access = key ? openToken(row.access_token_enc, key) : null;
  if (config && access) await revokeToken(config, access);
  const { error } = await supabaseAdmin.from("social_tokens").delete().eq("provider", PROVIDER);
  if (error) throw error;
}
