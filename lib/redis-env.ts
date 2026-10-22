// Where the Upstash Redis REST credentials come from. Pure (no imports) so
// lib/redis-env.test.mjs can check it.
//
// Production Vercel has the Vercel KV / Upstash integration variables
// (KV_REST_API_URL, KV_REST_API_TOKEN) and no UPSTASH_REDIS_REST_*; before
// 2026-10-22 rate limiting was therefore off in production. The explicit
// UPSTASH_* names still win when set.

export type RedisEnv = {
  url: string | null;
  token: string | null;
  /** Which variable names were used, for a presence-only log. */
  source: "upstash" | "kv" | "mixed" | "none";
};

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function resolveRedisEnv(
  env: Record<string, string | undefined> = process.env,
): RedisEnv {
  const upstashUrl = clean(env.UPSTASH_REDIS_REST_URL);
  const upstashToken = clean(env.UPSTASH_REDIS_REST_TOKEN);
  const url = upstashUrl ?? clean(env.KV_REST_API_URL);
  const token = upstashToken ?? clean(env.KV_REST_API_TOKEN);

  if (!url || !token) return { url: null, token: null, source: "none" };
  const source =
    upstashUrl && upstashToken ? "upstash" : !upstashUrl && !upstashToken ? "kv" : "mixed";
  return { url, token, source };
}
