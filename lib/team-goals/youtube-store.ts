// Server side of the YouTube connection: the social_tokens row with provider
// 'youtube' (migration 100, provider allowed by 106), token refresh before
// each read, and the founder card status. Mirrors tiktok-store.ts. Tokens
// are sealed with lib/team-goals/token-crypto.ts and never logged.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { openToken, sealToken, tokenKey } from "./token-crypto";
import {
  YOUTUBE_UPLOAD_SCOPE,
  fetchYouTubeChannel,
  hasScope,
  looksLikeTestingMode,
  refreshTokens,
  revokeToken,
  tokenAction,
  youtubeConfig,
  type YouTubeChannel,
  type YouTubeTokens,
} from "./youtube";

const PROVIDER = "youtube";

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

/** The provider check of migration 100 refuses 'youtube' until migration 106 runs. */
export function isProviderRefused(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23514" && /social_tokens_provider_check/.test(error?.message ?? "");
}

export function youtubeEnvConfig(origin: string) {
  return youtubeConfig(process.env, origin);
}

async function loadRow(): Promise<{ row: Row | null; tableMissing: boolean }> {
  const { data, error } = await supabaseAdmin.from("social_tokens").select("*").eq("provider", PROVIDER).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { row: null, tableMissing: true };
    throw error;
  }
  return { row: (data as Row | null) ?? null, tableMissing: false };
}

export type YouTubeStatus = {
  /** YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and SOCIAL_TOKENS_KEY are all set. */
  configured: boolean;
  missing: string[];
  tableReady: boolean;
  connected: boolean;
  accountName: string | null;
  connectedAt: string | null;
  lastReadAt: string | null;
  lastError: string | null;
  /** Google said when the connection ends (apps in « Testing »: 7 days). */
  refreshExpiresAt: string | null;
  testingMode: boolean;
  /** youtube.upload was granted (needed by « Publier partout »). */
  canUpload: boolean;
};

export async function getYouTubeStatus(): Promise<YouTubeStatus> {
  const missing = [
    !process.env.YOUTUBE_CLIENT_ID?.trim() && "YOUTUBE_CLIENT_ID",
    !process.env.YOUTUBE_CLIENT_SECRET?.trim() && "YOUTUBE_CLIENT_SECRET",
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
    refreshExpiresAt: row?.refresh_expires_at ?? null,
    testingMode: row ? looksLikeTestingMode(row.refresh_expires_at, row.connected_at) : false,
    canUpload: row ? hasScope(row.scope, YOUTUBE_UPLOAD_SCOPE) : false,
  };
}

/** True when the YouTube channel is connected (false when the table is missing). */
export async function isYouTubeConnected(): Promise<boolean> {
  try {
    return !!(await loadRow()).row;
  } catch {
    return false;
  }
}

/** Stores a fresh connection (callback). Replaces any previous one. */
export async function saveYouTubeConnection(tokens: YouTubeTokens, channel: YouTubeChannel | null, connectedBy: string) {
  const key = tokenKey(process.env);
  if (!key) throw new Error("SOCIAL_TOKENS_KEY missing or not 32 bytes");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("social_tokens").upsert({
    provider: PROVIDER,
    account_id: channel?.channelId ?? null,
    account_name: channel?.title ?? null,
    access_token_enc: sealToken(tokens.accessToken, key),
    access_expires_at: tokens.accessExpiresAt,
    refresh_token_enc: sealToken(tokens.refreshToken, key),
    refresh_expires_at: tokens.refreshExpiresAt,
    scope: tokens.scope,
    connected_by: connectedBy,
    connected_at: now,
    refreshed_at: now,
    last_read_at: null,
    last_error: null,
    updated_at: now,
  });
  if (error) throw error;
}

async function note(patch: Partial<Row> & Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("social_tokens").update({ ...patch, updated_at: new Date().toISOString() }).eq("provider", PROVIDER);
  if (error) console.error("[youtube] token row update failed", { code: error.code, message: error.message });
}

export type YouTubeAccess = { ok: true; token: string; scope: string } | { ok: false; error: string; notConnected?: boolean };

/**
 * A usable YouTube access token, refreshed first when it has less than 10
 * minutes left (Google's access token lasts about an hour). Shared by the
 * follower readings, Studio > Statistiques and, later, « Publier partout ».
 * Google normally keeps the same refresh token; when it sends a new one, it
 * replaces the old. Never throws on Google errors; the French reason is
 * returned and stored in last_error. The token is never logged.
 */
export async function getFreshYouTubeAccess(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<YouTubeAccess> {
  const { row } = await loadRow();
  if (!row) return { ok: false, error: "La chaîne YouTube n'est pas connectée.", notConnected: true };
  const key = tokenKey(process.env);
  const config = youtubeConfig(process.env, "https://roogobf.com");
  if (!key || !config) return { ok: false, error: "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET ou SOCIAL_TOKENS_KEY manquant" };
  const access = openToken(row.access_token_enc, key);
  const refresh = openToken(row.refresh_token_enc, key);
  if (!access || !refresh) {
    const error = "Jetons illisibles (SOCIAL_TOKENS_KEY a changé ?) : reconnecter YouTube";
    await note({ last_error: error });
    return { ok: false, error };
  }

  const action = tokenAction({ accessExpiresAt: row.access_expires_at, refreshExpiresAt: row.refresh_expires_at }, now);
  if (action === "reconnect") {
    const error = "Autorisation Google expirée : reconnecter YouTube. Publiez l'application Google « En production » pour que la connexion ne s'arrête plus après 7 jours.";
    await note({ last_error: error });
    return { ok: false, error };
  }
  if (action === "refresh") {
    const next = await refreshTokens(config, refresh, fetchImpl, now);
    if (!next.ok) {
      const error = `Rafraîchissement refusé : ${next.error}`;
      await note({ last_error: error });
      return { ok: false, error };
    }
    await note({
      access_token_enc: sealToken(next.accessToken, key),
      access_expires_at: next.accessExpiresAt,
      ...(next.refreshToken ? { refresh_token_enc: sealToken(next.refreshToken, key) } : {}),
      ...(next.refreshExpiresAt ? { refresh_expires_at: next.refreshExpiresAt } : {}),
      scope: next.scope || row.scope,
      refreshed_at: now.toISOString(),
    });
    return { ok: true, token: next.accessToken, scope: next.scope || row.scope };
  }
  return { ok: true, token: access, scope: row.scope };
}

export type YouTubeRead = { state: "not connected" } | { state: "ok"; value: number } | { state: "failed"; error: string };

/**
 * The subscriber count for the nightly cron: a fresh access token, then
 * channels.list?mine=true. Never throws on Google errors; the reason is
 * returned and stored in last_error. A channel that hides its count fails
 * with a French reason (no reading is written).
 */
export async function readYouTubeSubscribers(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<YouTubeRead> {
  const access = await getFreshYouTubeAccess(now, fetchImpl);
  if (!access.ok) return access.notConnected ? { state: "not connected" } : { state: "failed", error: access.error };
  const channel = await fetchYouTubeChannel(access.token, fetchImpl);
  if (!channel.ok) {
    await note({ last_error: channel.error });
    return { state: "failed", error: channel.error };
  }
  if (channel.subscriberCount === null) {
    const error = "La chaîne cache son nombre d'abonnés : l'afficher dans YouTube Studio pour que l'objectif se lise.";
    await note({ last_error: error });
    return { state: "failed", error };
  }
  await note({ last_read_at: now.toISOString(), last_error: null, account_name: channel.title, account_id: channel.channelId });
  return { state: "ok", value: channel.subscriberCount };
}

/** Revokes the grant at Google (best effort) and deletes the row. */
export async function disconnectYouTube() {
  const { row } = await loadRow();
  if (!row) return;
  const key = tokenKey(process.env);
  const refresh = key ? openToken(row.refresh_token_enc, key) : null;
  if (refresh) await revokeToken(refresh);
  const { error } = await supabaseAdmin.from("social_tokens").delete().eq("provider", PROVIDER);
  if (error) throw error;
}
