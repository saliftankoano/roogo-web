import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Check if Upstash is configured
const isUpstashConfigured = 
  process.env.UPSTASH_REDIS_REST_URL && 
  process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;

if (isUpstashConfigured) {
  redis = Redis.fromEnv();
}

// Different rate limits for different endpoints
export const paymentLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 payments per minute
      analytics: true,
      prefix: "ratelimit:payment",
    })
  : null;

export const listingLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"), // 10 listings per hour
      analytics: true,
      prefix: "ratelimit:listing",
    })
  : null;

export const authLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "5 m"), // 5 attempts per 5 minutes
      analytics: true,
      prefix: "ratelimit:auth",
    })
  : null;

export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<{ success: boolean; headers: Headers }> {
  const headers = new Headers();

  // If rate limiting is not configured, allow the request
  if (!limiter) {
    console.warn("Rate limiting not configured - Upstash Redis not available");
    return { success: true, headers };
  }

  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  headers.set("X-RateLimit-Limit", limit.toString());
  headers.set("X-RateLimit-Remaining", remaining.toString());
  headers.set("X-RateLimit-Reset", reset.toString());

  return { success, headers };
}
