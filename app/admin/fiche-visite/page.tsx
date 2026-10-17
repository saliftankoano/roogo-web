import { redirect } from "next/navigation";
import { getTeamPeople, getViewer } from "@/lib/team-tasks/server";
import { isUuid } from "@/lib/team-tasks/core";
import { getStart } from "@/lib/field-visits/server";
import { urbanist } from "@/components/admin/team/font";
import { FicheVisiteApp } from "@/components/admin/fiche-visite/FicheVisiteApp";
import { FicheStartPicker } from "@/components/admin/fiche-visite/FicheStartPicker";
import { FicheProblem } from "@/components/admin/fiche-visite/FicheProblem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fiche de visite" };

// /admin/fiche-visite?bien=<property id>: start (or resume) the sheet for a listing.
// Without ?bien, pick the listing first (from the briefing).
export default async function FicheVisitePage({ searchParams }: { searchParams: Promise<{ bien?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  const { bien } = await searchParams;
  if (!isUuid(bien)) {
    return (
      <div className={urbanist.className}>
        <FicheStartPicker />
      </div>
    );
  }
  try {
    const people = await getTeamPeople(viewer);
    const result = await getStart(viewer, bien, people);
    if (!result.ok) return <FicheProblem text={result.error} />;
    const { property, open, installed } = result.value;
    return (
      <div className={urbanist.className}>
        <FicheVisiteApp property={property} people={result.value.people} viewerId={viewer.id} server={open} openedById={false} installed={installed} />
      </div>
    );
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("[field-visits] start page failed", { code: e?.code, message: e?.message });
    return <FicheProblem text="La fiche n’a pas pu se charger. Rechargez la page dans un instant." />;
  }
}
