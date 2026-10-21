import { urbanist } from "@/components/admin/team/font";
import { getFollowerHistory, getSocialSnapshot } from "@/lib/social/insights-server";
import { SocialStats } from "./SocialStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Statistiques des réseaux | Studio" };

// Studio > Statistiques: Facebook Page, Instagram and TikTok numbers (followers, posts
// with reach, views and interactions, posting rhythm). Access: studio.use
// (app/admin/studio/layout.tsx). The snapshot is cached 6 h and refreshed by
// /api/cron/social-insights.
export default async function SocialStatsPage() {
  const snapshot = await getSocialSnapshot();
  const history = await getFollowerHistory(snapshot);
  return (
    <div className={urbanist.className}>
      <SocialStats initial={{ snapshot, history }} />
    </div>
  );
}
