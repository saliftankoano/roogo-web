"use client";

import Link from "next/link";
import { ArrowDownIcon, CalendarCheckIcon } from "@phosphor-icons/react";
import { KuulaCollectionFrame } from "@/components/visites-3d/KuulaCollectionFrame";
import { ProofStat, Reveal } from "@/components/marketing/MarketingPrimitives";

const DEMO_COLLECTION_URL = "https://kuula.co/share/collection/7MDZD";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#17120f] px-3 pb-3 pt-28 sm:px-6 lg:pt-32">
      <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-white/10 bg-neutral-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <Reveal>
            <div className="inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/70">
              Visites 3D · Ouagadougou
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.02] tracking-tight text-white md:text-6xl">
              Faites visiter votre bien depuis n&apos;importe où.
            </h1>
            <p className="mt-6 max-w-xl text-base font-medium leading-8 text-white/70 md:text-lg">
              Roogo scanne votre bien en 3D et vous remet un lien de visite
              immersive, partageable sans limite. Vos clients — à Ouagadougou
              comme dans la diaspora — visitent depuis leur téléphone, avant de
              se déplacer.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#reserver"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-4 text-sm font-black text-white transition-colors hover:bg-primary-hover"
              >
                <CalendarCheckIcon size={18} weight="fill" />
                Réserver un scan
              </Link>
              <Link
                href="#realisations"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-7 py-4 text-sm font-black text-white transition-colors hover:border-primary hover:text-primary"
              >
                <ArrowDownIcon size={18} />
                Voir nos réalisations
              </Link>
            </div>
            <div className="mt-12 grid grid-cols-3 gap-4">
              <ProofStat dark value="~2 h" label="sur place" />
              <ProofStat dark value="72 h" label="de livraison" />
              <ProofStat dark value="7j/7" label="entre 7h et 17h" />
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="relative">
              <div className="absolute -top-3 left-6 z-10 rounded-full bg-primary px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-primary/30">
                Démo en direct — glissez pour explorer
              </div>
              <KuulaCollectionFrame
                shareUrl={DEMO_COLLECTION_URL}
                title="Visite 3D — démonstration Roogo"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
