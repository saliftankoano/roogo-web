import { currentUser } from "@clerk/nextjs/server";
import { urbanist } from "@/components/admin/team/font";
import { loadInbox, loadResponseSummary } from "@/lib/social/inbox-server";
import { staffLevelCan } from "@/lib/staff-access";
import { staffLevelFromMetadata } from "@/lib/staff-access-server";
import { ReseauxInbox } from "./ReseauxInbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Réseaux | Studio" };

// Studio > Réseaux: comments on the Facebook Page and Instagram posts, and the
// Messenger and Instagram direct messages, with a reply box on each. Stored by
// migration 101 and refreshed every 10 minutes by /api/cron/social-inbox.
// « Délai de réponse » (24 business hours rule, 2026-10-21) is read only for
// the Directeur and the Fondateur ("team.manage", the levels that run the
// team board); it never reaches other levels' pages.
export default async function ReseauxPage() {
  const now = new Date();
  const canSeeDelays = await currentUser()
    .then((user) => staffLevelCan(staffLevelFromMetadata(user?.publicMetadata), "team.manage"))
    .catch(() => false);
  const [initial, responses] = await Promise.all([
    loadInbox(now),
    canSeeDelays ? loadResponseSummary(now).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <div className={urbanist.className}>
      <ReseauxInbox initial={initial} responses={responses} />
    </div>
  );
}
