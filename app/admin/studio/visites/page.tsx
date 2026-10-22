import { redirect } from "next/navigation";
import { getTeamPeople, getViewer } from "@/lib/team-tasks/server";
import { isDirectorOrFounder } from "@/lib/team-tasks/core";
import { listSuivi } from "@/lib/field-visits/server";
import { urbanist } from "@/components/admin/team/font";
import { SuiviView } from "@/components/admin/fiche-visite/SuiviView";
import { FicheProblem } from "@/components/admin/fiche-visite/FicheProblem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visites terrain | Studio" };

// Studio > Visites terrain: the field visit sheets for the Directeur and the Fondateur.
export default async function VisitesTerrainPage({ searchParams }: { searchParams: Promise<{ fiche?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  if (!isDirectorOrFounder(viewer.level)) return <FicheProblem text="Le suivi des visites terrain est réservé au Directeur et au Fondateur." />;
  const { fiche } = await searchParams;
  try {
    const people = await getTeamPeople(viewer);
    const result = await listSuivi(people);
    if (!result.ok) return <FicheProblem text={result.error} />;
    return (
      <div className={urbanist.className}>
        <SuiviView
          initial={result.value.items}
          selectedId={fiche ?? null}
          canWithdraw={viewer.isFounder}
          people={people.map((p) => ({ id: p.id, firstName: p.firstName, initials: p.initials }))}
        />
      </div>
    );
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[field-visits] suivi page failed", { code: e?.code, message: e?.message });
    return <FicheProblem text="Le suivi n’a pas pu se charger. Rechargez la page dans un instant." />;
  }
}
