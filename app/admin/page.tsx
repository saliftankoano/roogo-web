import { redirect } from "next/navigation";
import { getBriefingPayload, getViewer } from "@/lib/team-tasks/server";
import { getMyDayReport } from "@/lib/team-tasks/day-reports-server";
import { BriefingView } from "@/components/admin/team/BriefingView";
import { urbanist } from "@/components/admin/team/font";
import { currentUser } from "@clerk/nextjs/server";
import { staffLevelCan } from "@/lib/staff-access";
import { staffLevelFromMetadata } from "@/lib/staff-access-server";
import { inboxCounts } from "@/lib/social/inbox-server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mon briefing" };

// Every staff member lands on their briefing (approved by Salif, 2026-10-14).
export default async function AdminPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  let payload;
  // « Fin de journée » never blocks the briefing: if it fails, the card is just not shown.
  const dayReportPromise = getMyDayReport(viewer).catch((error) => {
    console.error("[day-reports] card failed", { code: error?.code, message: error?.message });
    return null;
  });
  // « 3 commentaires et 2 messages attendent une réponse » (Studio > Réseaux).
  // Never blocks the briefing: zero before migration 101 or on any failure.
  const socialInboxPromise = currentUser()
    .then((user) => (staffLevelCan(staffLevelFromMetadata(user?.publicMetadata), "social.inbox") ? inboxCounts() : null))
    .catch((error) => {
      console.error("[social-inbox] briefing count failed", { message: error?.message });
      return null;
    });
  try {
    payload = await getBriefingPayload(viewer);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[team-tasks] briefing page failed", { code: e?.code, message: e?.message });
    return (
      <div className={urbanist.className}>
        <p role="alert" className="mx-auto max-w-xl rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
          Le briefing n’a pas pu se charger. Rechargez la page dans un instant.
        </p>
      </div>
    );
  }
  return (
    <div className={urbanist.className}>
      <BriefingView initial={payload} dayReport={await dayReportPromise} socialInbox={await socialInboxPromise} />
    </div>
  );
}
