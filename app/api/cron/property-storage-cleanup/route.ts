import { NextResponse } from "next/server";
import { processPropertyStorageCleanupQueue } from "@/lib/property-storage";
import { processPropertyRequestFileCleanupQueue } from "@/lib/property-request-storage";

// Vercel cron: drains queued property storage cleanup left by DB-driven deletes.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [result, requestFiles] = await Promise.all([
      processPropertyStorageCleanupQueue({ limit: 50 }),
      processPropertyRequestFileCleanupQueue(),
    ]);

    return NextResponse.json({
      success: result.failedCount === 0 && requestFiles.failedCount === 0,
      requestFiles,
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
