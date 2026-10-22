import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { staffLevelCan } from "@/lib/staff-access";
import { staffLevelFromMetadata } from "@/lib/staff-access-server";
import { getListingHealth } from "@/lib/listing-health-server";
import {
  INDEX_ALERT_AFTER_DAYS,
  INDEX_HEALTH_LABELS,
  coverageStateLabel,
  type IndexHealth,
} from "@/lib/listing-index";
import { LISTING_QUALITY_MIN } from "@/lib/listing-quality";

export const dynamic = "force-dynamic";

export const metadata = { title: "Annonces sur Google" };

const HEALTH_STYLES: Record<IndexHealth, string> = {
  indexed: "bg-green-50 text-green-700 border-green-200",
  waiting: "bg-yellow-50 text-yellow-800 border-yellow-200",
  late: "bg-red-50 text-red-700 border-red-200",
  unchecked: "bg-neutral-50 text-neutral-600 border-neutral-200",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

// Every live listing with the quality minimum and Google's latest answer
// (daily check, /api/cron/listing-index-check). Problems first.
export default async function ListingsOnGooglePage() {
  const user = await currentUser();
  if (!staffLevelCan(staffLevelFromMetadata(user?.publicMetadata), "listings.view")) {
    redirect("/admin");
  }

  const { rows, lastCheckedAt } = await getListingHealth();
  const late = rows.filter((row) => row.health === "late").length;
  const incomplete = rows.filter((row) => row.quality.some((c) => !c.ok)).length;
  const indexed = rows.filter((row) => row.health === "indexed").length;

  return (
    <div className="mx-auto max-w-6xl px-6 pt-32 pb-20">
      <Link href="/admin/annonces" className="text-sm font-bold text-primary hover:underline">
        Annonces
      </Link>
      <h1 className="mt-2 text-3xl font-black text-neutral-900">Annonces sur Google</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-500">
        Chaque annonce en ligne doit apparaître sur Google. Vérification automatique chaque
        matin{lastCheckedAt ? `, dernière le ${formatDate(lastCheckedAt)}` : ""}. Une annonce
        absente de Google {INDEX_ALERT_AFTER_DAYS} jours après sa mise en ligne passe en rouge.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Sur Google", value: `${indexed} / ${rows.length}` },
          { label: `Pas sur Google après ${INDEX_ALERT_AFTER_DAYS} jours`, value: String(late) },
          { label: "Annonces à compléter", value: String(incomplete) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-black text-neutral-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {!lastCheckedAt && (
        <p className="mt-6 rounded-2xl bg-[#FCEFD4] px-4 py-3 text-sm font-semibold text-[#6E4300]">
          La vérification Google n’a pas encore tourné : il faut la migration 098 et le compte
          de service Search Console. Les critères de qualité ci-dessous sont déjà à jour.
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-100 bg-white">
        <ul className="divide-y divide-neutral-100">
          {rows.map((row) => {
            const missing = row.quality.filter((c) => !c.ok);
            return (
              <li key={row.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/admin/annonces/${row.id}`}
                    className="block truncate text-sm font-bold text-neutral-900 hover:text-primary"
                  >
                    {row.reference ? `${row.reference} · ` : ""}
                    {row.headline}
                  </Link>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {missing.length === 0
                      ? "Annonce complète"
                      : missing
                          .map((c) =>
                            c.id === "description"
                              ? `Description : ${c.current} / ${LISTING_QUALITY_MIN.descriptionWords} mots`
                              : `Photos : ${c.current} / ${LISTING_QUALITY_MIN.photos}`,
                          )
                          .join(" · ")}
                    {row.index?.coverage_state
                      ? ` · Google : ${coverageStateLabel(row.index.coverage_state)}`
                      : ""}
                    {row.index && row.index.referring_urls.length === 0 && row.health !== "indexed"
                      ? " · aucun lien connu vers cette page"
                      : ""}
                    {row.index?.last_error ? ` · Erreur : ${row.index.last_error}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {missing.length > 0 && (
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                      À compléter
                    </span>
                  )}
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${HEALTH_STYLES[row.health]}`}>
                    {INDEX_HEALTH_LABELS[row.health]}
                  </span>
                  <a
                    href={row.path}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Voir
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
