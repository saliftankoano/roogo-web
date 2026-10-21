import { urbanist } from "@/components/admin/team/font";
import { getFollowerHistory, getSocialSnapshot } from "@/lib/social/insights-server";
import { getTikTokStatus, type TikTokStatus } from "@/lib/team-goals/tiktok-store";
import { getTeamPeople, getViewer } from "@/lib/team-tasks/server";
import { SocialStats, type TikTokAdmin } from "./SocialStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Statistiques des réseaux | Studio" };

// Studio > Statistiques: Facebook Page, Instagram and TikTok numbers (followers, posts
// with reach, views and interactions, posting rhythm). Access: studio.use
// (app/admin/studio/layout.tsx). The snapshot is cached 6 h and refreshed by
// /api/cron/social-insights.
//
// The TikTok card is also where the founder connects or disconnects TikTok
// (the OAuth callback comes back here with ?tiktok=<outcome>). The connection
// status is read for the founder only; every route checks the founder again.
export default async function SocialStatsPage() {
  const [snapshot, tiktok] = await Promise.all([getSocialSnapshot(), loadTikTokAdmin()]);
  const history = await getFollowerHistory(snapshot);
  return (
    <div className={urbanist.className}>
      <SocialStats initial={{ snapshot, history }} tiktok={tiktok} />
    </div>
  );
}

async function loadTikTokAdmin(): Promise<TikTokAdmin> {
  let founderName = "le fondateur";
  try {
    const viewer = await getViewer();
    if (!viewer) return { isFounder: false, founderName, status: null };
    if (viewer.isFounder) {
      let status: TikTokStatus | null = null;
      try {
        status = await getTikTokStatus();
      } catch (error) {
        const e = error as { code?: string; message?: string };
        console.error("[social-insights] tiktok status failed", { code: e?.code, message: e?.message });
      }
      return { isFounder: true, founderName, status };
    }
    const people = await getTeamPeople(viewer);
    founderName = people.find((p) => p.level === "fondateur")?.firstName ?? founderName;
    return { isFounder: false, founderName, status: null };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[social-insights] viewer read failed", { code: e?.code, message: e?.message });
    return { isFounder: false, founderName, status: null };
  }
}
