import { NextResponse } from "next/server";
import { getSocialSnapshot, invalidateSocialSnapshot } from "@/lib/social/insights-server";

// Vercel cron, every 6 hours at minute 30 (vercel.json): drops the cached
// Facebook, Instagram, TikTok and YouTube snapshot and reads them again, so Studio >
// Statistiques always opens on numbers less than 6 hours old. Read only: no
// table is written (follower readings stay with /api/cron/social-followers).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  invalidateSocialSnapshot();
  const snapshot = await getSocialSnapshot();
  const summary = (a: typeof snapshot.facebook) => ({
    ok: a.ok,
    followers: a.followers,
    posts: a.postCount,
    insights: a.insightsAvailable,
    warnings: a.warnings.length,
    error: a.error,
  });
  const body = {
    success: snapshot.facebook.ok || snapshot.instagram.ok || snapshot.tiktok.ok || snapshot.youtube.ok,
    fetchedAt: snapshot.fetchedAt,
    missing: snapshot.missing,
    facebook: summary(snapshot.facebook),
    instagram: summary(snapshot.instagram),
    tiktok: { ...summary(snapshot.tiktok), connected: !snapshot.tiktok.notConnected },
    youtube: { ...summary(snapshot.youtube), connected: !snapshot.youtube.notConnected },
  };
  if (!body.success) console.error("[social-insights] cron could not read any account", body);
  return NextResponse.json(body);
}
