import { redirect } from "next/navigation";
import { getViewer } from "@/lib/team-tasks/server";
import { isDirectorOrFounder } from "@/lib/team-tasks/core";
import { getCallLog } from "@/lib/team-tasks/calls-server";
import { CallLog } from "@/components/admin/team/CallLog";
import { urbanist } from "@/components/admin/team/font";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notes d’appels" };

// Directeur and Fondateur only (the API checks it too); everyone else goes back to Accueil.
export default async function CallNotesRoute() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  if (!isDirectorOrFounder(viewer.level)) redirect("/admin");
  let result;
  try {
    result = await getCallLog(viewer);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[call-notes] log page failed", { code: e?.code, message: e?.message });
    result = null;
  }
  if (!result || !result.ok) {
    return (
      <div className={urbanist.className}>
        <p role="alert" className="mx-auto max-w-xl rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
          Les notes d’appels n’ont pas pu se charger. Rechargez la page dans un instant.
        </p>
      </div>
    );
  }
  return (
    <div className={urbanist.className}>
      <CallLog log={result.value} viewerName={viewer.firstName} viewerLevelLabel={viewer.levelLabel} />
    </div>
  );
}
