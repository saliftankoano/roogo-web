import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchFollowers,
  followerTargets,
  readingsToInsert,
} from "@/lib/team-goals/meta-followers";

// Vercel cron, daily at 02:00 UTC (vercel.json): reads the Facebook page and
// Instagram account follower counts from the Meta Graph API and writes one
// team_goal_readings row per metric and day with source 'automatique'. A
// day that already has a reading (typed in or automatic) is left alone.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.META_GRAPH_TOKEN?.trim();
  if (!token) return NextResponse.json({ skipped: "no token" });

  const targets = followerTargets({
    META_PAGE_ID: process.env.META_PAGE_ID,
    META_IG_ACCOUNT_ID: process.env.META_IG_ACCOUNT_ID,
  });
  if (!targets.length) return NextResponse.json({ skipped: "no account ids" });

  const todayKey = new Date().toISOString().slice(0, 10);
  const results = await Promise.all(targets.map((target) => fetchFollowers(target, token)));
  for (const result of results) {
    if (!result.ok) {
      console.error("[social-followers] Meta read failed", {
        metric: result.metric,
        status: result.status,
        code: result.code,
        error: result.error,
      });
    }
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("team_goal_readings")
    .select("metric, measured_on")
    .in("metric", targets.map((t) => t.metric))
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
    written: rows.map((r) => ({ metric: r.metric, value: r.value })),
    skipped: results.filter((r) => r.ok && !rows.some((row) => row.metric === r.metric)).map((r) => r.metric),
    failed: results.filter((r) => !r.ok).map((r) => ({ metric: r.metric, error: r.ok ? "" : r.error })),
  });
}
