import { NextResponse } from "next/server";
import { processPropertyStorageCleanupQueue } from "@/lib/property-storage";

// Vercel cron: drains queued property storage cleanup left by DB-driven deletes.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processPropertyStorageCleanupQueue({ limit: 50 });

    return NextResponse.json({
      success: result.failedCount === 0,
      processed: result.processedCount,
      failed: result.failedCount,
      deletedPathCount: result.deletedPathCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Storage cleanup cron failed";

    console.error("Property storage cleanup cron failed:", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
