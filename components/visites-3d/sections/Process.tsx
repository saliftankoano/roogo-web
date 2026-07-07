"use client";

import {
  CalendarCheckIcon,
  CameraIcon,
  LinkSimpleIcon,
} from "@phosphor-icons/react";
import {
  DarkSection,
  InteractiveCard,
  SectionHeader,
} from "@/components/marketing/MarketingPrimitives";

const steps = [
  {
    icon: CalendarCheckIcon,
    title: "1. Vous réservez",
    body: "Choisissez un créneau de 2 heures, 7j/7 entre 7h et 17h. En quelques clics, sans appel.",
  },
  {
    icon: CameraIcon,
    title: "2. On scanne",
    body: "Notre équipe se déplace sur site avec l'équipement. Le scan complet prend environ 2 heures.",
  },
  {
    icon: LinkSimpleIcon,
    title: "3. Vous partagez",
    body: "Vous recevez un lien de visite sous 72h. Partagez-le à vos clients — ils visitent en 1 clic.",
  },
];

export function Process() {
  return (
    <DarkSection>
      <SectionHeader
        dark
        align="center"
        kicker="Processus"
        title="Comment ça marche."
        description="Trois étapes simples, de la réservation jusqu'au lien partageable."
      />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {steps.map((step) => (
          <InteractiveCard
            key={step.title}
            className="rounded-[28px] border border-white/10 bg-white/[0.06] p-8 hover:border-white/20 hover:bg-white/[0.08]"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <step.icon size={28} weight="fill" />
            </div>
            <h3 className="mt-6 text-xl font-black text-white">{step.title}</h3>
            <p className="mt-3 text-sm font-medium leading-7 text-white/60">
              {step.body}
            </p>
          </InteractiveCard>
        ))}
      </div>
    </DarkSection>
  );
}
