import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { getFollowerHistory, getSocialSnapshot, invalidateSocialSnapshot } from "@/lib/social/insights-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Below this age a refresh request reuses the snapshot (protects the Meta rate limit). */
const MIN_REFRESH_MS = 10 * 60 * 1000;

// Studio > Statistiques: the cached Facebook and Instagram snapshot plus the
// follower history. Every Studio user can read it.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req, "studio.use");
  if (!staff) return errorResponse("Forbidden", 403, req);
  const snapshot = await getSocialSnapshot();
  const history = await getFollowerHistory(snapshot);
  return NextResponse.json({ snapshot, history });
}

// « Actualiser »: reads Meta again unless the snapshot is under 10 minutes old.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req, "studio.use");
  if (!staff) return errorResponse("Forbidden", 403, req);
  const current = await getSocialSnapshot();
  const age = Date.now() - new Date(current.fetchedAt).getTime();
  let refreshed = false;
  let snapshot = current;
  if (!(age >= 0 && age < MIN_REFRESH_MS)) {
    invalidateSocialSnapshot();
    snapshot = await getSocialSnapshot();
    refreshed = true;
  }
  const history = await getFollowerHistory(snapshot);
  return NextResponse.json({ snapshot, history, refreshed });
}
