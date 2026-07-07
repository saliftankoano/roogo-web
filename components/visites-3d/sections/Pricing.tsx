"use client";

import Link from "next/link";
import { CheckIcon } from "@phosphor-icons/react";
import {
  EditorialSection,
  InteractiveCard,
  SectionHeader,
} from "@/components/marketing/MarketingPrimitives";
import { PRICE_PER_ROOM } from "@/lib/visites-3d";

const features = [
  "Scan 3D complet du bien, réalisé sur place par notre équipe",
  "Lien de visite partageable sans limite (WhatsApp, annonces, réseaux)",
  "Hébergement de la visite inclus, accessible sur tous les appareils",
  "Intégration de la visite 3D à votre annonce Roogo",
  "Livraison sous 72 h après le passage de l'équipe",
];

export function Pricing() {
  return (
    <EditorialSection>
      <SectionHeader
        align="center"
        kicker="Tarif clair"
        title="Simple et sans surprise."
        description="Un seul tarif, sans abonnement, sans minimum. Zone desservie : Ouagadougou."
      />
      <InteractiveCard className="mx-auto mt-14 max-w-2xl rounded-[30px] border border-[#e7dacb] bg-white p-8 shadow-lg shadow-[#5a321a]/5 hover:shadow-xl hover:shadow-[#5a321a]/10 md:p-12">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
          Visite 3D Roogo
        </div>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
          <span className="text-5xl font-black tracking-tight text-neutral-950 md:text-6xl">
            {PRICE_PER_ROOM.toLocaleString("fr-FR")}
          </span>
          <span className="text-2xl font-black text-neutral-950/80">FCFA</span>
          <span className="text-base font-bold text-neutral-500">/ pièce</span>
        </div>
        <p className="mt-3 text-sm font-medium text-neutral-500">
          Une pièce = un espace à capturer : salon, chambre, cuisine, cour,
          etc. Le total dépend simplement du nombre de pièces.
        </p>
        <ul className="mt-8 grid gap-4">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <CheckIcon size={14} weight="bold" />
              </span>
              <span className="text-base font-medium leading-7 text-neutral-700">
                {feature}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="#reserver"
          className="mt-10 inline-flex w-full items-center justify-center rounded-full bg-primary px-7 py-4 text-sm font-black text-white transition-colors hover:bg-primary-hover"
        >
          Réserver mon créneau
        </Link>
      </InteractiveCard>
    </EditorialSection>
  );
}
