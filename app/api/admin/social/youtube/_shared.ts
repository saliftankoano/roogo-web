import { NextResponse } from "next/server";
import { getViewer, type Viewer } from "@/lib/team-tasks/server";

export const STATE_COOKIE = "roogo_youtube_oauth_state";
/** PKCE code verifier, kept with the state for the 10 minutes of the Google consent page. */
export const VERIFIER_COOKIE = "roogo_youtube_oauth_verifier";
export const COOKIE_PATH = "/api/admin/social/youtube";
/** Where the YouTube connection lives: the YouTube card of Studio > Statistiques. */
export const STATS_PAGE = "/admin/studio/statistiques";

/** Founder only: connecting or disconnecting the Roogo YouTube channel. */
export async function requireFounder(): Promise<Viewer | NextResponse> {
  const viewer = await getViewer();
  if (!viewer || !viewer.isFounder) {
    return NextResponse.json({ error: "Réservé au Fondateur." }, { status: 403 });
  }
  return viewer;
}

/** One cookie of the request (the OAuth cookies are scoped to these routes). */
export function cookieOf(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  return raw ? decodeURIComponent(raw) : null;
}

/** Back to Studio > Statistiques with the outcome (?youtube=...) for the YouTube card. Clears the OAuth cookies. */
export function backToStats(req: Request, outcome: string) {
  const url = new URL(STATS_PAGE, req.url);
  url.searchParams.set("youtube", outcome);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(STATE_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
  res.cookies.set(VERIFIER_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
  return res;
}
