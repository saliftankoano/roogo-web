import { NextResponse } from "next/server";
import {
  fetchFollowers,
  followerTargets,
  type FollowerResult,
} from "@/lib/team-goals/meta-followers";
import { writeFollowerReadings } from "@/lib/team-goals/follower-readings-server";
import { readTikTokFollowers } from "@/lib/team-goals/tiktok-store";
import { readYouTubeSubscribers } from "@/lib/team-goals/youtube-store";

// Vercel cron, daily at 02:00 UTC (vercel.json): reads the Facebook page and
// Instagram account follower counts from the Meta Graph API, and the TikTok
// follower count of @roogo.226 through TikTok's Display API when the founder
// has connected TikTok (« Connecter TikTok » in the TikTok card of /admin/studio/statistiques; the access
// token is refreshed here when needed), and the subscriber count of the Roogo
// YouTube channel when the founder has connected YouTube (« Connecter YouTube »
// in the YouTube card, same page). Writes one team_goal_readings row per
// metric and day with source 'automatique' (writeFollowerReadings): today's
// automatic reading is refreshed if it exists, a manual reading of the day is
// never overwritten. Studio > Statistiques writes the same readings on every
// fresh snapshot. Each platform is skipped on its own: no Meta token does not
// stop TikTok or YouTube, and the reverse.

type TikTokOutcome = "not connected" | "read" | { error: string };
type YouTubeOutcome = TikTokOutcome;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const results: FollowerResult[] = [];
  const notes: Record<string, unknown> = {};

  // Meta (Facebook, Instagram).
  const token = process.env.META_GRAPH_TOKEN?.trim();
  const targets = followerTargets({
    META_PAGE_ID: process.env.META_PAGE_ID,
    META_IG_ACCOUNT_ID: process.env.META_IG_ACCOUNT_ID,
  });
  if (!token) notes.meta = "no token";
  else if (!targets.length) notes.meta = "no account ids";
  else results.push(...(await Promise.all(targets.map((target) => fetchFollowers(target, token)))));

  // TikTok, only when connected.
  let tiktok: TikTokOutcome = "not connected";
  try {
    const read = await readTikTokFollowers();
    if (read.state === "ok") {
      tiktok = "read";
      results.push({ metric: "tiktok_followers", ok: true, value: read.value });
    } else if (read.state === "failed") {
      tiktok = { error: read.error };
      results.push({ metric: "tiktok_followers", ok: false, error: read.error });
    }
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[social-followers] TikTok read crashed", { code: e?.code, message: e?.message });
    tiktok = { error: "lecture impossible" };
  }
  notes.tiktok = tiktok;

  // YouTube, only when connected.
  let youtube: YouTubeOutcome = "not connected";
  try {
    const read = await readYouTubeSubscribers();
    if (read.state === "ok") {
      youtube = "read";
      results.push({ metric: "youtube_subscribers", ok: true, value: read.value });
    } else if (read.state === "failed") {
      youtube = { error: read.error };
      results.push({ metric: "youtube_subscribers", ok: false, error: read.error });
    }
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[social-followers] YouTube read crashed", { code: e?.code, message: e?.message });
    youtube = { error: "lecture impossible" };
  }
  notes.youtube = youtube;

  for (const result of results) {
    if (!result.ok) {
      console.error("[social-followers] read failed", {
        metric: result.metric,
        status: result.status,
        code: result.code,
        error: result.error,
      });
    }
  }
  if (!results.length) return NextResponse.json({ skipped: true, ...notes });

  const write = await writeFollowerReadings(results, todayKey);
  if (!write.ok) {
    console.error("[social-followers] readings write failed", { error: write.error });
    return NextResponse.json({ error: "readings write failed" }, { status: 500 });
  }
  const { plan } = write;

  return NextResponse.json({
    success: true,
    date: todayKey,
    ...notes,
    written: plan.inserts.map((r) => ({ metric: r.metric, value: r.value })),
    updated: plan.updates.map((r) => ({ metric: r.metric, value: r.value })),
    keptManual: plan.keptManual,
    failed: results.filter((r) => !r.ok).map((r) => ({ metric: r.metric, error: r.ok ? "" : r.error })),
  });
}
