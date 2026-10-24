import { NextResponse } from "next/server";
import { tokenKey } from "@/lib/team-goals/token-crypto";
import { buildAuthorizeUrl, newOAuthSecrets } from "@/lib/team-goals/youtube";
import { getYouTubeStatus, youtubeEnvConfig } from "@/lib/team-goals/youtube-store";
import { COOKIE_PATH, STATE_COOKIE, VERIFIER_COOKIE, backToStats, requireFounder } from "../_shared";

// GET: founder only. Starts Google OAuth (youtube.readonly + youtube.upload,
// offline access, consent screen every time) for the Roogo YouTube channel:
// a random state and a PKCE verifier go into httpOnly cookies scoped to these
// routes for 10 minutes, then the browser goes to Google's consent page.
export async function GET(req: Request) {
  const viewer = await requireFounder();
  if (viewer instanceof NextResponse) return viewer;
  const config = youtubeEnvConfig(new URL(req.url).origin);
  if (!config || !tokenKey(process.env)) return backToStats(req, "config");
  try {
    const status = await getYouTubeStatus();
    if (!status.tableReady) return backToStats(req, "table");
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[youtube] status check failed", { code: e?.code, message: e?.message });
    return backToStats(req, "erreur");
  }
  const { state, verifier, challenge } = newOAuthSecrets();
  const res = NextResponse.redirect(buildAuthorizeUrl(config, state, challenge), { status: 303 });
  const cookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: COOKIE_PATH, maxAge: 600 };
  res.cookies.set(STATE_COOKIE, state, cookie);
  res.cookies.set(VERIFIER_COOKIE, verifier, cookie);
  return res;
}
