import { NextResponse } from "next/server";
import { runPublishingWorker } from "@/lib/studio/publishing-server";

// Polling Instagram and Facebook video processing can take a few minutes.
export const maxDuration = 300;

// Vercel cron, every 10 minutes: publishes Studio calendar posts a founder
// approved ("valide") whose time has come, to the Roogo Facebook Page and
// Instagram account. Protected like the other crons by CRON_SECRET.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runPublishingWorker();
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("studio-publish failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
