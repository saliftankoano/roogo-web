import { redirect } from "next/navigation";
import { getTeamPeople, getViewer } from "@/lib/team-tasks/server";
import { isUuid } from "@/lib/team-tasks/core";
import { getFiche } from "@/lib/field-visits/server";
import { urbanist } from "@/components/admin/team/font";
import { FicheVisiteApp } from "@/components/admin/fiche-visite/FicheVisiteApp";
import { FicheProblem } from "@/components/admin/fiche-visite/FicheProblem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fiche de visite" };

// /admin/fiche-visite/<id>: one sheet by its link, e.g. started on the phone and continued on a computer.
export default async function FicheVisiteByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  const { id } = await params;
  if (!isUuid(id)) return <FicheProblem text="Fiche introuvable." />;
  try {
    const [result, people] = await Promise.all([getFiche(id), getTeamPeople(viewer)]);
    if (!result.ok) return <FicheProblem text={result.error} />;
    const payload = result.value;
    return (
      <div className={urbanist.className}>
        <FicheVisiteApp
          property={payload.property}
          people={people.map((p) => ({ id: p.id, firstName: p.firstName, fullName: p.fullName, initials: p.initials, levelLabel: p.levelLabel }))}
          viewerId={viewer.id}
          server={payload}
          openedById
          installed
        />
      </div>
    );
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[field-visits] sheet page failed", { code: e?.code, message: e?.message });
    return <FicheProblem text="La fiche n’a pas pu se charger. Rechargez la page dans un instant." />;
  }
}
