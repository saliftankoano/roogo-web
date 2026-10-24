import { urbanist } from "@/components/admin/team/font";
import { getFollowerHistory, getSocialSnapshot } from "@/lib/social/insights-server";
import { getTikTokStatus, type TikTokStatus } from "@/lib/team-goals/tiktok-store";
import { getYouTubeStatus, type YouTubeStatus } from "@/lib/team-goals/youtube-store";
import { getTeamPeople, getViewer } from "@/lib/team-tasks/server";
import { SocialStats, type TikTokAdmin, type YouTubeAdmin } from "./SocialStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Statistiques des réseaux | Studio" };

// Studio > Statistiques: Facebook Page, Instagram, TikTok and YouTube numbers (followers, posts
// with reach, views and interactions, posting rhythm). Access: studio.use
// (app/admin/studio/layout.tsx). The snapshot is cached 6 h and refreshed by
// /api/cron/social-insights.
//
// The TikTok and YouTube cards are also where the founder connects or
// disconnects each account (the OAuth callbacks come back here with
// ?tiktok=<outcome> or ?youtube=<outcome>). The connection statuses are read
// for the founder only; every route checks the founder again.
export default async function SocialStatsPage() {
  const [snapshot, admins] = await Promise.all([getSocialSnapshot(), loadAdmins()]);
  const history = await getFollowerHistory(snapshot);
  return (
    <div className={urbanist.className}>
      <SocialStats initial={{ snapshot, history }} tiktok={admins.tiktok} youtube={admins.youtube} />
    </div>
  );
}

async function safeStatus<T>(label: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error(`[social-insights] ${label} status failed`, { code: e?.code, message: e?.message });
    return null;
  }
}

async function loadAdmins(): Promise<{ tiktok: TikTokAdmin; youtube: YouTubeAdmin }> {
  let founderName = "le fondateur";
  const none = () => ({ tiktok: { isFounder: false, founderName, status: null }, youtube: { isFounder: false, founderName, status: null } });
  try {
    const viewer = await getViewer();
    if (!viewer) return none();
    if (viewer.isFounder) {
      const [tiktok, youtube] = await Promise.all([
        safeStatus<TikTokStatus>("tiktok", getTikTokStatus),
        safeStatus<YouTubeStatus>("youtube", getYouTubeStatus),
      ]);
      return { tiktok: { isFounder: true, founderName, status: tiktok }, youtube: { isFounder: true, founderName, status: youtube } };
    }
    const people = await getTeamPeople(viewer);
    founderName = people.find((p) => p.level === "fondateur")?.firstName ?? founderName;
    return none();
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[social-insights] viewer read failed", { code: e?.code, message: e?.message });
    return none();
  }
}
