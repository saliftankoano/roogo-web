import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { MIN_REFRESH_MS, loadInbox, syncInbox } from "@/lib/social/inbox-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// « Actualiser »: reads Meta again unless the last read is under 2 minutes old
// (the cron reads every 10 minutes; this protects Meta's rate limit).
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req, "social.inbox");
  if (!staff) return errorResponse("Forbidden", 403, req);
  try {
    const summary = await syncInbox({ minIntervalMs: MIN_REFRESH_MS });
    const payload = await loadInbox();
    return NextResponse.json({ ...payload, refreshed: summary.ready && !summary.skipped });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[social-inbox] refresh failed", { code: e?.code, message: e?.message });
    return errorResponse("L'actualisation a échoué. Réessayez dans un instant.", 500, req);
  }
}
