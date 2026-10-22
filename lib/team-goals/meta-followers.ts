// Follower counts of the Roogo Burkina Facebook page and the @roogo.burkina
// Instagram account, read from the Meta Graph API for « Nos objectifs ».
// No imports: the parsing and the skip decision are tested with node:test,
// and the nightly cron (app/api/cron/social-followers) does the writes.
//
// Env (server only, never NEXT_PUBLIC): META_GRAPH_TOKEN, META_PAGE_ID,
// META_IG_ACCOUNT_ID. The token is sent in the Authorization header and is
// never logged.

export const META_GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 10_000;

/** tiktok_followers comes from lib/team-goals/tiktok.ts, written by the same cron. */
export type FollowerMetric = "facebook_followers" | "instagram_followers" | "tiktok_followers";

export type FollowerTarget = { metric: FollowerMetric; objectId: string };

export type FollowerResult =
  | { metric: FollowerMetric; ok: true; value: number }
  | { metric: FollowerMetric; ok: false; error: string; status?: number; code?: number };

/** Which accounts to read, from the env. A missing id skips that metric. */
export function followerTargets(env: { META_PAGE_ID?: string; META_IG_ACCOUNT_ID?: string }): FollowerTarget[] {
  const out: FollowerTarget[] = [];
  const page = env.META_PAGE_ID?.trim();
  const ig = env.META_IG_ACCOUNT_ID?.trim();
  if (page) out.push({ metric: "facebook_followers", objectId: page });
  if (ig) out.push({ metric: "instagram_followers", objectId: ig });
  return out;
}

/** The Graph error as « code: message », or null when the body is not an error. */
export function metaErrorOf(body: unknown): { code?: number; message: string } | null {
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (!error || typeof error !== "object") return null;
  return {
    code: typeof error.code === "number" ? error.code : undefined,
    message: typeof error.message === "string" ? error.message.slice(0, 300) : "Erreur Meta sans message",
  };
}

/** followers_count from a Graph response, or null when it is missing or not a whole number. */
export function parseFollowersCount(body: unknown): number | null {
  const raw = (body as { followers_count?: unknown } | null)?.followers_count;
  const n = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 1_000_000_000) return null;
  return n;
}

/** Reads one account. Never throws; the error names the HTTP status and the Meta code, not the token. */
export async function fetchFollowers(
  target: FollowerTarget,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FollowerResult> {
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(target.objectId)}?fields=followers_count`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    const metaError = metaErrorOf(body);
    if (!res.ok || metaError) {
      return {
        metric: target.metric,
        ok: false,
        status: res.status,
        code: metaError?.code,
        error: metaError ? `Meta ${metaError.code ?? "?"}: ${metaError.message}` : `HTTP ${res.status}`,
      };
    }
    const value = parseFollowersCount(body);
    if (value == null) return { metric: target.metric, ok: false, status: res.status, error: "followers_count absent de la réponse" };
    return { metric: target.metric, ok: true, value };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      metric: target.metric,
      ok: false,
      error: aborted ? `Pas de réponse de Meta en ${TIMEOUT_MS / 1000} s` : `Erreur réseau: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rows to insert for today: one per metric read successfully, skipped when
 * a reading for that metric and day already exists (manual or automatic).
 */
export function readingsToInsert(
  results: FollowerResult[],
  existing: { metric: string; measured_on: string }[],
  todayKey: string,
): { metric: FollowerMetric; value: number; measured_on: string; source: "automatique" }[] {
  const taken = new Set(existing.filter((r) => r.measured_on === todayKey).map((r) => r.metric));
  return results
    .filter((r): r is Extract<FollowerResult, { ok: true }> => r.ok)
    .filter((r) => !taken.has(r.metric))
    .map((r) => ({ metric: r.metric, value: r.value, measured_on: todayKey, source: "automatique" as const }));
}

export type ExistingReading = { id: string; metric: string; measured_on: string; source: string | null; value: number };

export type ReadingPlan = {
  inserts: { metric: FollowerMetric; value: number; measured_on: string; source: "automatique" }[];
  /** Today's automatic reading of that metric, refreshed to the latest value. */
  updates: { id: string; metric: FollowerMetric; value: number }[];
  /** Metrics left alone: someone typed today's number in (a manual reading wins). */
  keptManual: FollowerMetric[];
};

/**
 * Today's automatic follower readings, kept fresh through the day (the 6 h
 * statistics refresh, « Actualiser », the TikTok connection, the nightly cron):
 * insert when the day has no reading, update today's automatic reading when
 * the number moved, and never touch a day that has a manual reading.
 */
export function planFollowerReadings(results: FollowerResult[], existing: ExistingReading[], todayKey: string): ReadingPlan {
  const plan: ReadingPlan = { inserts: [], updates: [], keptManual: [] };
  const today = existing.filter((r) => r.measured_on === todayKey);
  const seen = new Set<FollowerMetric>();
  for (const result of results) {
    if (!result.ok || seen.has(result.metric)) continue;
    seen.add(result.metric);
    const rows = today.filter((r) => r.metric === result.metric);
    if (rows.some((r) => (r.source ?? "manuel") !== "automatique")) {
      plan.keptManual.push(result.metric);
      continue;
    }
    const auto = rows[0];
    if (!auto) plan.inserts.push({ metric: result.metric, value: result.value, measured_on: todayKey, source: "automatique" });
    else if (Number(auto.value) !== result.value) plan.updates.push({ id: auto.id, metric: result.metric, value: result.value });
  }
  return plan;
}
