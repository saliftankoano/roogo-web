import type { Metadata } from "next";
import { RecrutementClient } from "@/components/admin/recrutement/RecrutementClient";
import { urbanist } from "@/components/admin/team/font";
import { COMMERCIAL_IMMOBILIER_SLUG, getJobRole } from "@/lib/job-applications";

export const metadata: Metadata = { title: "Recrutement | Administration Roogo" };

export default async function RecrutementPage({
  searchParams,
}: {
  searchParams: Promise<{ poste?: string }>;
}) {
  const { poste } = await searchParams;
  const role = getJobRole(poste) ?? getJobRole(COMMERCIAL_IMMOBILIER_SLUG)!;
  return (
    <div className={urbanist.className}>
      <RecrutementClient roleSlug={role.slug} />
    </div>
  );
}
