import { redirect } from "next/navigation";
import { getTeamPeople, getViewer } from "@/lib/team-tasks/server";
import { getGoalsPayload } from "@/lib/team-goals/server";
import { GoalsPage } from "@/components/admin/team/goals/GoalsPage";
import { urbanist } from "@/components/admin/team/font";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nos objectifs" };

// Every staff member reads the goals and the levers; only the founder changes
// them (checked by /api/admin/goals). Opened from Accueil (the staff home).
export default async function GoalsRoute({ searchParams }: { searchParams: Promise<{ objectif?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  const { objectif } = await searchParams;
  let payload;
  let founderName = "le Fondateur";
  try {
    const people = await getTeamPeople(viewer);
    founderName = people.find((p) => p.level === "fondateur")?.firstName ?? founderName;
    payload = await getGoalsPayload(viewer, people);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[team-goals] goals page failed", { code: e?.code, message: e?.message });
    return (
      <div className={urbanist.className}>
        <p role="alert" className="mx-auto max-w-xl rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
          Les objectifs n’ont pas pu se charger. Rechargez la page dans un instant.
        </p>
      </div>
    );
  }
  return (
    <div className={urbanist.className}>
      <GoalsPage initial={payload} initialGoalId={typeof objectif === "string" ? objectif : null} founderName={founderName} />
    </div>
  );
}
