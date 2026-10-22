import { redirect } from "next/navigation";
import { dayKey } from "@/lib/team-tasks/core";
import { getBoardPayload, getViewer } from "@/lib/team-tasks/server";
import { getTeamDayReports } from "@/lib/team-tasks/day-reports-server";
import { TeamBoard } from "@/components/admin/team/TeamBoard";
import { urbanist } from "@/components/admin/team/font";

export const dynamic = "force-dynamic";

export const metadata = { title: "L’équipe" };

// Directeur and Fondateur only; everyone else goes back to their briefing.
export default async function TeamPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  let result;
  // « Fin de journée » never blocks the board: on failure the chips and the summary are just not shown.
  const reportsPromise = getTeamDayReports(viewer)
    .then((r) => (r.ok ? r.value : null))
    .catch((error) => {
      console.error("[day-reports] team failed", { code: error?.code, message: error?.message });
      return null;
    });
  try {
    result = await getBoardPayload(viewer);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[team-tasks] team page failed", { code: e?.code, message: e?.message });
    return (
      <div className={urbanist.className}>
        <p role="alert" className="mx-auto max-w-xl rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
          Le tableau de l’équipe n’a pas pu se charger. Rechargez la page dans un instant.
        </p>
      </div>
    );
  }
  if (!result.ok) redirect("/admin");
  return (
    <div className={urbanist.className}>
      <TeamBoard
        initial={result.value}
        todayKey={dayKey(new Date())}
        viewerName={viewer.firstName}
        viewerLevelLabel={viewer.levelLabel}
        dayReports={await reportsPromise}
      />
    </div>
  );
}
