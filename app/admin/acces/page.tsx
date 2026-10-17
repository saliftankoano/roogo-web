import { redirect } from "next/navigation";
import { getViewer } from "@/lib/team-tasks/server";
import { isDirectorOrFounder } from "@/lib/team-tasks/core";
import { AccessGuide } from "@/components/admin/access/AccessGuide";
import { urbanist } from "@/components/admin/team/font";
import { staffLevelsEnforced } from "@/lib/staff-access";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accès" };

// Tab « Qui peut faire quoi » of « Accès », for every staff member and the
// founder: the access levels as the code enforces them, rendered from
// lib/access/matrix.ts. The other tab is ./niveaux (team.manage only).
export default async function AccessPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return (
    <div className={urbanist.className}>
      <AccessGuide
        viewerLevel={viewer.level}
        canSeeTeam={isDirectorOrFounder(viewer.level)}
        levelsEnforced={staffLevelsEnforced()}
      />
    </div>
  );
}
