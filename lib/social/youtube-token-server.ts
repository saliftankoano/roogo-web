// YouTube Shorts as a « Publier une vidéo » destination (2026-10-24): whether
// it can be ticked (channel connected with youtube.upload) and a fresh access
// token for the worker. Mirrors tiktok-token-server.ts. The token is never
// logged and never leaves the server.

import { getFreshYouTubeAccess, getYouTubeStatus } from "@/lib/team-goals/youtube-store";
import { YOUTUBE_UPLOAD_SCOPE, hasScope } from "@/lib/team-goals/youtube";
import { youtubePublishInfo, type YouTubePublishInfo } from "./youtube-upload";

/** Whether a validated video may target YouTube Shorts, with the French reason when not. Never throws. */
export async function youtubePublishStatus(): Promise<YouTubePublishInfo> {
  try {
    return youtubePublishInfo(await getYouTubeStatus(), process.env);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[youtube-publish] status failed", { code: e?.code, message: e?.message });
    return youtubePublishInfo(null, process.env);
  }
}

/** A usable access token with youtube.upload (refreshed when close to expiry), or the French reason. */
export async function youtubeAccessToken(now = new Date()): Promise<{ token: string } | { error: string }> {
  const info = await youtubePublishStatus();
  if (!info.enabled) return { error: info.reason ?? "YouTube n'est pas disponible." };
  const access = await getFreshYouTubeAccess(now);
  if (!access.ok) return { error: access.error };
  if (!hasScope(access.scope, YOUTUBE_UPLOAD_SCOPE)) return { error: "Reconnectez YouTube en autorisant la mise en ligne (youtube.upload)." };
  return { token: access.token };
}
