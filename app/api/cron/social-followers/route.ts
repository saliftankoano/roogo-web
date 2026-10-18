import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchFollowers,
  followerTargets,
  readingsToInsert,
  type FollowerResult,
} from "@/lib/team-goals/meta-followers";
import { readTikTokFollowers } from "@/lib/team-goals/tiktok-store";

// Vercel cron, daily at 02:00 UTC (vercel.json): reads the Facebook page and
// Instagram account follower counts from the Meta Graph API, and the TikTok
// follower count of @roogo.226 through TikTok's Display API when the founder
// has connected TikTok (« Connecter TikTok » on /admin/objectifs; the access
// token is refreshed here when needed). Writes one team_goal_readings row per
// metric and day with source 'automatique'. A day that already has a reading
// (typed in or automatic) is left alone. Each platform is skipped on its own:
// no Meta token does not stop TikTok, and the reverse.

type TikTokOutcome = "not connected" | "read" | { error: string };

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

  const metrics = [...new Set(results.map((r) => r.metric))];
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("team_goal_readings")
    .select("metric, measured_on")
    .in("metric", metrics)
    .eq("measured_on", todayKey);
  if (existingError) {
    console.error("[social-followers] existing readings check failed", {
      code: existingError.code,
      message: existingError.message,
    });
    return NextResponse.json({ error: "readings check failed" }, { status: 500 });
  }

  const rows = readingsToInsert(results, existing ?? [], todayKey);
  if (rows.length) {
    const { error: insertError } = await supabaseAdmin.from("team_goal_readings").insert(rows);
    if (insertError) {
      console.error("[social-followers] insert failed", {
        code: insertError.code,
        message: insertError.message,
      });
      return NextResponse.json({ error: "insert failed" }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    date: todayKey,
    ...notes,
    written: rows.map((r) => ({ metric: r.metric, value: r.value })),
    skipped: results.filter((r) => r.ok && !rows.some((row) => row.metric === r.metric)).map((r) => r.metric),
    failed: results.filter((r) => !r.ok).map((r) => ({ metric: r.metric, error: r.ok ? "" : r.error })),
  });
}
