import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { exchangeCode, fetchTikTokProfile, hasStatsScope } from "@/lib/team-goals/tiktok";
import { saveTikTokConnection, tiktokEnvConfig } from "@/lib/team-goals/tiktok-store";
import { STATE_COOKIE, backToGoals, requireFounder } from "../_shared";

function sameState(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// GET: TikTok sends the founder back here with ?code&state (or ?error). The
// state must match the cookie set by /connect; the code is exchanged for
// tokens, which are sealed and stored in social_tokens. Never logs a token.
export async function GET(req: Request) {
  const viewer = await requireFounder();
  if (viewer instanceof NextResponse) return viewer;
  const url = new URL(req.url);
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1);
  if (!sameState(url.searchParams.get("state"), cookie ? decodeURIComponent(cookie) : null)) {
    console.error("[tiktok] callback state mismatch", { hasCookie: !!cookie, hasState: url.searchParams.has("state") });
    return backToGoals(req, "etat");
  }
  if (url.searchParams.get("error")) {
    console.error("[tiktok] authorization refused", { error: url.searchParams.get("error")?.slice(0, 80) });
    return backToGoals(req, "refus");
  }
  const code = url.searchParams.get("code");
  const config = tiktokEnvConfig(url.origin);
  if (!code || !config) return backToGoals(req, code ? "config" : "erreur");

  const tokens = await exchangeCode(config, code);
  if (!tokens.ok) {
    console.error("[tiktok] code exchange failed", { status: tokens.status, code: tokens.code, error: tokens.error });
    return backToGoals(req, "erreur");
  }
  if (!hasStatsScope(tokens.scope)) return backToGoals(req, "scope");
  const profile = await fetchTikTokProfile(tokens.accessToken);
  if (!profile.ok) console.error("[tiktok] first profile read failed", { status: profile.status, code: profile.code, error: profile.error });
  try {
    await saveTikTokConnection(tokens, profile.ok ? profile : null, viewer.id);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[tiktok] saving the connection failed", { code: e?.code, message: e?.message });
    return backToGoals(req, "erreur");
  }
  return backToGoals(req, "connecte");
}
