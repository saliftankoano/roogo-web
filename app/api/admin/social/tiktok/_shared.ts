import { NextResponse } from "next/server";
import { getViewer, type Viewer } from "@/lib/team-tasks/server";

export const STATE_COOKIE = "roogo_tiktok_oauth_state";
export const COOKIE_PATH = "/api/admin/social/tiktok";
export const GOALS_PAGE = "/admin/objectifs";

/** Founder only: connecting or disconnecting the Roogo TikTok account. */
export async function requireFounder(): Promise<Viewer | NextResponse> {
  const viewer = await getViewer();
  if (!viewer || !viewer.isFounder) {
    return NextResponse.json({ error: "Réservé au Fondateur." }, { status: 403 });
  }
  return viewer;
}

/** Back to « Nos objectifs » with the outcome for the TikTok card. */
export function backToGoals(req: Request, outcome: string) {
  const url = new URL(GOALS_PAGE, req.url);
  url.searchParams.set("tiktok", outcome);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(STATE_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
  return res;
}
