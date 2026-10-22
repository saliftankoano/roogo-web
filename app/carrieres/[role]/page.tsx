import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { Footer } from "@/components/Footer";
import { JobApplicationFlow } from "@/components/carrieres/JobApplicationFlow";
import { JobDeadlineBadge } from "@/components/carrieres/JobDeadlineBadge";
import { urbanist } from "@/components/admin/team/font";
import { fetchLatestSaleListingWithPhotos } from "@/lib/data";
import { JOB_ROLES, getJobRole } from "@/lib/job-applications";
import { toVideoTestListing } from "@/lib/job-applications-server";

// Public job offer with its application form. Role facts, deadline and
// questions come from JOB_ROLES (lib/job-applications.ts). The listing for
// the video test is the most recent live sale listing with photos, read at
// most every 10 minutes.
export const revalidate = 600;

export function generateStaticParams() {
  return Object.keys(JOB_ROLES).map((role) => ({ role }));
}

type PageProps = { params: Promise<{ role: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const role = getJobRole((await params).role);
  if (!role) return {};
  return {
    title: `${role.title} à Ouagadougou, Roogo recrute`,
    description: `${role.title}, ${role.contract.toLowerCase()}, ${role.place}. Candidatures ouvertes jusqu'au ${role.deadlineLabel}.`,
    alternates: { canonical: `/carrieres/${role.slug}` },
  };
}

export default async function JobOfferPage({ params }: PageProps) {
  const role = getJobRole((await params).role);
  if (!role) notFound();

  const property = await fetchLatestSaleListingWithPhotos();
  const listing = property ? toVideoTestListing(property) : null;
  const renderedAt = new Date().toISOString();

  return (
    <div className={`${urbanist.className} min-h-screen bg-[#faf6f0] text-neutral-900`}>
      <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-24 sm:px-6 md:pt-32">
        <Link
          href="/carrieres"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-800"
        >
          <ArrowLeftIcon size={16} weight="bold" />
          Carrières
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <section aria-labelledby="offre-titre">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c96a2e]">Roogo recrute</p>
            <h1 id="offre-titre" className="mt-3 text-[2rem] font-extrabold leading-tight tracking-tight sm:text-5xl">
              {role.title}
            </h1>
            <p className="mt-3 text-base font-medium text-neutral-600">
              {role.contract}, {role.place}
            </p>

            <JobDeadlineBadge slug={role.slug} renderedAt={renderedAt} />

            <a
              href="#candidature"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#c96a2e] px-5 py-3.5 text-base font-bold text-white hover:bg-[#8a4924] lg:hidden"
            >
              Postuler
            </a>

            <dl className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
              <div className="py-4">
                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Ta mission</dt>
                <dd className="mt-2 space-y-2 text-[15px] leading-6">
                  {role.priorities.map((p, i) => (
                    <p key={p}>
                      <span className="font-bold">Priorité {i + 1} :</span> {p}
                    </p>
                  ))}
                  <p className="text-neutral-600">Un plus : {role.plus.charAt(0).toLowerCase() + role.plus.slice(1)}</p>
                </dd>
              </div>
              <div className="py-4">
                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Exigé</dt>
                <dd className="mt-2 text-[15px] leading-6">{role.requirement}</dd>
              </div>
              <div className="py-4">
                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Salaire</dt>
                <dd className="mt-2 space-y-1 text-[15px] leading-6">
                  {role.pay.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </dd>
              </div>
              <div className="py-4">
                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Début</dt>
                <dd className="mt-2 text-[15px] leading-6">
                  Le {role.startDateLabel}. Nos ventes se font au comptant uniquement.
                </dd>
              </div>
            </dl>

            <p className="mt-5 text-sm leading-6 text-neutral-600">
              On postule uniquement ici, pas sur WhatsApp. Compte 15 minutes et une vidéo de 60 à 90 secondes.
            </p>
          </section>

          <section id="candidature" aria-label="Formulaire de candidature" className="scroll-mt-24">
            <JobApplicationFlow slug={role.slug} listing={listing} renderedAt={renderedAt} />
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
