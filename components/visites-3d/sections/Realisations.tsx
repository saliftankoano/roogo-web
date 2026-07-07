"use client";

import Link from "next/link";
import {
  ArrowSquareOutIcon,
  MapPinIcon,
} from "@phosphor-icons/react";
import { KuulaCollectionFrame } from "@/components/visites-3d/KuulaCollectionFrame";
import {
  EditorialSection,
  ProofStat,
  Reveal,
  SectionHeader,
} from "@/components/marketing/MarketingPrimitives";

type Realisation = {
  name: string;
  type: string;
  city: string;
  kuulaShareUrl: string;
  mapsUrl: string;
  stats: { value: string; label: string }[];
};

const realisations: Realisation[] = [
  {
    name: "Restaurant Italien Rosa Dei Venti",
    type: "Restaurant",
    city: "Ouagadougou",
    kuulaShareUrl: "https://kuula.co/share/collection/7M2C4",
    mapsUrl: "https://maps.app.goo.gl/4Zdg2Hpk7n2ohSni8",
    stats: [
      { value: "5", label: "Espaces capturés" },
      { value: "28", label: "Angles à explorer" },
      { value: "72h", label: "De la capture à la livraison" },
    ],
  },
];

export function Realisations() {
  return (
    <EditorialSection id="realisations" className="scroll-mt-24 bg-white">
      <SectionHeader
        align="center"
        kicker="Réalisations"
        title="Chaque espace mérite sa visite."
        description="Voici ce que nous livrons. Pas une photo, pas une vidéo — une visite complète, explorable et partageable. Glissez pour entrer."
      />

      <div className="mt-14 grid gap-14">
        {realisations.map((realisation) => (
          <article key={realisation.name}>
            <Reveal>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-3xl font-black leading-tight tracking-tight text-neutral-950 md:text-5xl">
                    {realisation.name}
                  </h3>
                  <p className="mt-3 text-base font-medium text-neutral-500">
                    {realisation.type} · {realisation.city}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={realisation.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-5 py-3 text-sm font-black text-neutral-950 transition-colors hover:border-primary hover:text-primary"
                  >
                    <MapPinIcon size={18} />
                    Localisation
                  </Link>
                  <Link
                    href={realisation.kuulaShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-primary"
                  >
                    <ArrowSquareOutIcon size={18} />
                    Plein écran
                  </Link>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-neutral-200 pt-8 sm:max-w-xl">
                {realisation.stats.map((stat) => (
                  <ProofStat
                    key={stat.label}
                    value={stat.value}
                    label={stat.label}
                  />
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.1} className="mt-8">
              <KuulaCollectionFrame
                shareUrl={realisation.kuulaShareUrl}
                title={`Visite 3D — ${realisation.name}`}
              />
            </Reveal>
          </article>
        ))}
      </div>

      <Reveal className="mt-16">
        <div className="relative overflow-hidden rounded-[30px] bg-neutral-950 p-10 text-white md:p-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(201,106,46,0.5),transparent)]"
          />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">
                Le prochain chapitre
              </div>
              <h3 className="mt-5 text-3xl font-black leading-tight tracking-tight md:text-5xl">
                Et si c&apos;était votre bien, la prochaine fois ?
              </h3>
              <p className="mt-5 text-base font-medium leading-8 text-white/70">
                Maison, villa, appartement, bureau, restaurant, salle
                d&apos;événement — n&apos;importe quel espace que vos clients
                méritent de voir avant de venir. Nous scannons sur place, vous
                recevez le lien sous 72h.
              </p>
            </div>
            <Link
              href="#reserver"
              className="inline-flex items-center justify-center gap-2 self-start whitespace-nowrap rounded-full bg-primary px-7 py-4 text-sm font-black text-white transition-colors hover:bg-primary-hover md:self-auto"
            >
              Réserver mon scan
            </Link>
          </div>
        </div>
      </Reveal>
    </EditorialSection>
  );
}
