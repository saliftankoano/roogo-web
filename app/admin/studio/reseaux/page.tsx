import { urbanist } from "@/components/admin/team/font";
import { loadInbox } from "@/lib/social/inbox-server";
import { ReseauxInbox } from "./ReseauxInbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Réseaux | Studio" };

// Studio > Réseaux: comments on the Facebook Page and Instagram posts, and the
// Messenger and Instagram direct messages, with a reply box on each. Stored by
// migration 101 and refreshed every 10 minutes by /api/cron/social-inbox.
export default async function ReseauxPage() {
  const initial = await loadInbox();
  return (
    <div className={urbanist.className}>
      <ReseauxInbox initial={initial} />
    </div>
  );
}
