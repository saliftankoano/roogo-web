import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { YOUTUBE_READONLY_SCOPE, YOUTUBE_UPLOAD_SCOPE, exchangeCode, fetchYouTubeChannel, hasScope } from "@/lib/team-goals/youtube";
import { isProviderRefused, saveYouTubeConnection, youtubeEnvConfig } from "@/lib/team-goals/youtube-store";
import { invalidateSocialSnapshot } from "@/lib/social/insights-server";
import { writeFollowerReadings } from "@/lib/team-goals/follower-readings-server";
import { STATE_COOKIE, VERIFIER_COOKIE, backToStats, cookieOf, requireFounder } from "../_shared";

function sameState(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// GET: Google sends the founder back here with ?code&state (or ?error). The
// state must match the cookie set by /connect; the code is exchanged with the
// PKCE verifier for tokens, which are sealed and stored in social_tokens
// (provider 'youtube'). Both scopes must be granted. Never logs a token.
export async function GET(req: Request) {
  const viewer = await requireFounder();
  if (viewer instanceof NextResponse) return viewer;
  const url = new URL(req.url);
  const stateCookie = cookieOf(req, STATE_COOKIE);
  if (!sameState(url.searchParams.get("state"), stateCookie)) {
    console.error("[youtube] callback state mismatch", { hasCookie: !!stateCookie, hasState: url.searchParams.has("state") });
    return backToStats(req, "etat");
  }
  if (url.searchParams.get("error")) {
    console.error("[youtube] authorization refused", { error: url.searchParams.get("error")?.slice(0, 80) });
    return backToStats(req, "refus");
  }
  const code = url.searchParams.get("code");
  const verifier = cookieOf(req, VERIFIER_COOKIE);
  if (!code) return backToStats(req, "erreur");
  if (!verifier) return backToStats(req, "etat");
  const config = youtubeEnvConfig(url.origin);
  if (!config) return backToStats(req, "config");

  const tokens = await exchangeCode(config, code, verifier);
  if (!tokens.ok) {
    console.error("[youtube] code exchange failed", { status: tokens.status, code: tokens.code, error: tokens.error });
    return backToStats(req, "erreur");
  }
  if (!hasScope(tokens.scope, YOUTUBE_READONLY_SCOPE) || !hasScope(tokens.scope, YOUTUBE_UPLOAD_SCOPE)) return backToStats(req, "scope");
  const channel = await fetchYouTubeChannel(tokens.accessToken);
  if (!channel.ok) {
    console.error("[youtube] first channel read failed", { status: channel.status, code: channel.code, error: channel.error });
    // A Google account without a channel is the wrong account: nothing is stored.
    if (channel.code === "no_channel") return backToStats(req, "chaine");
  }
  try {
    await saveYouTubeConnection(tokens, channel.ok ? channel : null, viewer.id);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[youtube] saving the connection failed", { code: e?.code, message: e?.message });
    return backToStats(req, isProviderRefused(e) ? "table" : "erreur");
  }
  // The YouTube goal updates right away: today's automatic reading from the
  // first channel read (a manual reading of the day is kept). Non-fatal.
  if (channel.ok && channel.subscriberCount !== null) {
    const write = await writeFollowerReadings([{ metric: "youtube_subscribers", ok: true, value: channel.subscriberCount }]);
    if (!write.ok) console.error("[youtube] first subscriber reading not written", { error: write.error });
  }
  // The Statistiques snapshot said « not connected »: read again on the next visit.
  invalidateSocialSnapshot();
  return backToStats(req, "connecte");
}
