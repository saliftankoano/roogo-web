import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const isUpstashConfigured = redisUrl && redisToken;

let redis: Redis | null = null;

if (isUpstashConfigured) {
  redis = new Redis({ url: redisUrl!, token: redisToken! });
}

export { redis };

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

export const advertisingProofUploadLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(6, "1 h"),
      analytics: true,
      prefix: "ratelimit:advertising-proof-upload",
    })
  : null;

export const studioLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      analytics: true,
      prefix: "ratelimit:studio",
    })
  : null;

export const studioPreviewLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 h"),
      analytics: true,
      prefix: "ratelimit:studio-preview",
    })
  : null;

export const studioChatLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 h"),
      analytics: true,
      prefix: "ratelimit:studio-chat",
    })
  : null;

export const studioCloneLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 d"),
      analytics: true,
      prefix: "ratelimit:studio-clone",
    })
  : null;

export const studioJobLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      analytics: true,
      prefix: "ratelimit:studio-job",
    })
  : null;

// Public job applications (/carrieres/<slug>). Generous per IP: candidates
// on mobile data in Burkina often share one carrier IP (CGNAT).
export const jobApplicationIpLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      analytics: true,
      prefix: "ratelimit:job-application-ip",
    })
  : null;

export const jobApplicationPhoneLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(6, "1 d"),
      analytics: true,
      prefix: "ratelimit:job-application-phone",
    })
  : null;

export const jobApplicationUploadLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(40, "1 h"),
      analytics: true,
      prefix: "ratelimit:job-application-upload",
    })
  : null;

/** First address of x-forwarded-for (Vercel), else x-real-ip, else "unknown". */
export function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || "unknown";
}

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

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    headers.set("X-RateLimit-Limit", limit.toString());
    headers.set("X-RateLimit-Remaining", remaining.toString());
    headers.set("X-RateLimit-Reset", reset.toString());

    return { success, headers };
  } catch (error) {
    console.warn("Rate limit check failed (Redis unreachable) - allowing request:", error);
    return { success: true, headers };
  }
}
