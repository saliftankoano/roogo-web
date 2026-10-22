import { NextResponse } from "next/server";
import { syncInbox } from "@/lib/social/inbox-server";

// Vercel cron, every 10 minutes (vercel.json): reads new Facebook and
// Instagram comments and conversations into Studio > Réseaux. Protected like
// the other crons by CRON_SECRET. Read only at Meta: nothing is ever posted.
// Before migration 101 it answers { ready: false } and does nothing.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await syncInbox();
    if (summary.ready && summary.sources.every((s) => !s.ok)) console.error("[social-inbox] cron could not read any source", summary);
    return NextResponse.json({ success: summary.ready, ...summary });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[social-inbox] cron failed", { code: e?.code, message: e?.message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
