// Server side of Studio > Statistiques: env, Page token swap, cache and the
// follower history already stored by the nightly cron (team_goal_readings).
//
// Storage: no new table. The Meta snapshot lives in the Next data cache
// (unstable_cache, tag "social-insights", 6 h) and the cron
// /api/cron/social-insights refreshes it every 6 hours. Follower history comes
// from team_goal_readings (written by /api/cron/social-followers), read only.

import { revalidateTag, unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { metaConfigFromEnv } from "@/lib/studio/meta-graph";
import {
  SOCIAL_GRAPH_VERSION,
  followerTrend,
  frenchSocialError,
  graphGet,
  isCacheable,
  logShape,
  readSocialSnapshot,
  type FetchLike,
  type FollowerTrend,
  type SocialConfig,
  type SocialSnapshot,
} from "./insights";

export const SOCIAL_CACHE_TAG = "social-insights";
export const SOCIAL_CACHE_SECONDS = 6 * 60 * 60;

const log = (message: string, detail: Record<string, unknown>) => console.error(message, detail);

const fetchImpl: FetchLike = (url, init) => fetch(url, init);

/** Reads Meta now, uncached. Never throws. */
export async function loadSocialSnapshot(): Promise<SocialSnapshot> {
  const env = metaConfigFromEnv(process.env);
  const graphVersion = env.config?.graphVersion ?? SOCIAL_GRAPH_VERSION;
  const systemToken = env.config?.pageToken ?? "";
  const cfg: SocialConfig = {
    graphVersion,
    pageId: env.config?.pageId ?? "",
    igUserId: env.config?.igUserId ?? "",
    pageToken: systemToken,
    igToken: systemToken,
  };

  // Page insights need the Page token. A system user token that manages the
  // Page reads it from GET /{page}?fields=access_token. On failure we keep the
  // system token: posts and followers may still read, the warning says why
  // statistics are missing.
  let pageTokenWarning: string | null = null;
  if (env.config?.needsPageToken && cfg.pageId) {
    try {
      const data = await graphGet(fetchImpl, graphVersion, systemToken, cfg.pageId, { fields: "access_token" });
      if (typeof data.access_token === "string" && data.access_token) cfg.pageToken = data.access_token;
      else pageTokenWarning = "Le jeton Meta ne donne pas le jeton de la Page Facebook : l'utilisateur système doit gérer la Page.";
    } catch (error) {
      log("[social-insights] page token swap failed", logShape(error));
      pageTokenWarning = frenchSocialError(error, "facebook", "statistiques");
    }
  }

  const snapshot = await readSocialSnapshot({ fetch: fetchImpl }, cfg, env.missing, log);
  if (pageTokenWarning && !snapshot.facebook.warnings.includes(pageTokenWarning)) {
    snapshot.facebook.warnings.unshift(pageTokenWarning);
  }
  return snapshot;
}

class NotCacheable extends Error {
  constructor(readonly snapshot: SocialSnapshot) {
    super("social snapshot not cacheable");
  }
}

// A snapshot where neither account could be read is thrown, so it is not
// cached for 6 hours: the next visit tries again.
const cachedSnapshot = unstable_cache(
  async () => {
    const snapshot = await loadSocialSnapshot();
    if (!isCacheable(snapshot)) throw new NotCacheable(snapshot);
    return snapshot;
  },
  ["social-insights-v1"],
  { revalidate: SOCIAL_CACHE_SECONDS, tags: [SOCIAL_CACHE_TAG] },
);

export async function getSocialSnapshot(): Promise<SocialSnapshot> {
  try {
    return await cachedSnapshot();
  } catch (error) {
    if (error instanceof NotCacheable) return error.snapshot;
    log("[social-insights] snapshot failed", { message: error instanceof Error ? error.message : String(error) });
    return loadSocialSnapshot();
  }
}

/** Drops the cached snapshot; the next read goes to Meta. */
export function invalidateSocialSnapshot() {
  revalidateTag(SOCIAL_CACHE_TAG);
}

export type SocialHistory = { facebook: FollowerTrend; instagram: FollowerTrend; error: string | null };

/** Follower readings of the last 120 days, written by /api/cron/social-followers or typed in. */
export async function getFollowerHistory(snapshot: SocialSnapshot, now = new Date()): Promise<SocialHistory> {
  const since = new Date(now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("team_goal_readings")
    .select("metric, value, measured_on")
    .in("metric", ["facebook_followers", "instagram_followers"])
    .gte("measured_on", since)
    .order("measured_on", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[social-insights] follower history read failed", { code: error.code, message: error.message });
  }
  const rows = (data ?? []) as { metric: string; value: number; measured_on: string }[];
  return {
    facebook: followerTrend(rows.filter((r) => r.metric === "facebook_followers"), snapshot.facebook.followers, now),
    instagram: followerTrend(rows.filter((r) => r.metric === "instagram_followers"), snapshot.instagram.followers, now),
    error: error ? "L'historique des abonnés n'a pas pu se charger." : null,
  };
}
