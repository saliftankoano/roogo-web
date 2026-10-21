import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { tokenKey } from "@/lib/team-goals/token-crypto";
import { buildAuthorizeUrl } from "@/lib/team-goals/tiktok";
import { getTikTokStatus, tiktokEnvConfig } from "@/lib/team-goals/tiktok-store";
import { COOKIE_PATH, STATE_COOKIE, backToStats, requireFounder } from "../_shared";

// GET: founder only. Starts TikTok Login Kit (scope user.info.stats) for the
// @roogo.226 account: a random state goes into an httpOnly cookie scoped to
// these routes for 10 minutes, then the browser goes to TikTok's consent page.
export async function GET(req: Request) {
  const viewer = await requireFounder();
  if (viewer instanceof NextResponse) return viewer;
  const config = tiktokEnvConfig(new URL(req.url).origin);
  if (!config || !tokenKey(process.env)) return backToStats(req, "config");
  try {
    const status = await getTikTokStatus();
    if (!status.tableReady) return backToStats(req, "table");
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[tiktok] status check failed", { code: e?.code, message: e?.message });
    return backToStats(req, "erreur");
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildAuthorizeUrl(config, state), { status: 303 });
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 600,
  });
  return res;
}
