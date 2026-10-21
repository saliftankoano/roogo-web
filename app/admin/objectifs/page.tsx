import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// « Nos objectifs » merged into Accueil on 2026-10-21 (approved design): the
// goals, the principle and the levers tally live on /admin, and each goal's
// levers in its drawer. Old links keep working: ?objectif=<id> opens that
// goal's drawer on Accueil.
export default async function GoalsRoute({ searchParams }: { searchParams: Promise<{ objectif?: string | string[] }> }) {
  const { objectif } = await searchParams;
  const id = typeof objectif === "string" && /^[\w-]{1,64}$/.test(objectif) ? objectif : null;
  redirect(id ? `/admin?objectif=${encodeURIComponent(id)}` : "/admin");
}
