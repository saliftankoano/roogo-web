"use client";

import {
  EditorialSection,
  InteractiveCard,
  SectionHeader,
} from "@/components/marketing/MarketingPrimitives";

const benefits = [
  {
    n: "01",
    title: "Moins de visites physiques ratées.",
    body: "Vos clients trient depuis leur canapé. Seuls les vrais intéressés se déplacent — vous ne perdez plus vos samedis en visites inutiles.",
  },
  {
    n: "02",
    title: "Plus de partages spontanés.",
    body: "Une annonce avec visite 3D se remarque dans un fil WhatsApp. Le lien circule tout seul, chez les amis, chez la famille, à l'étranger.",
  },
  {
    n: "03",
    title: "Vendez ou louez plus vite.",
    body: "La diaspora visite depuis Paris, Abidjan, Dakar. Pas besoin d'attendre le prochain voyage pour prendre une décision.",
  },
];

export function Benefits() {
  return (
    <EditorialSection>
      <SectionHeader
        align="center"
        kicker="Pourquoi une visite 3D ?"
        title="Un avantage concret pour vos locations et vos ventes."
        description="Ce que les propriétaires et agences qui sont passés à la visite 3D gagnent, concrètement."
      />
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {benefits.map((benefit) => (
          <InteractiveCard
            key={benefit.n}
            className="rounded-[28px] border border-[#e7dacb] bg-white/70 p-8 hover:shadow-xl hover:shadow-[#5a321a]/10"
          >
            <div className="text-6xl font-black leading-none tracking-tighter text-primary">
              {benefit.n}
            </div>
            <h3 className="mt-6 text-2xl font-black leading-tight text-neutral-950">
              {benefit.title}
            </h3>
            <p className="mt-3 text-base font-medium leading-8 text-neutral-600">
              {benefit.body}
            </p>
          </InteractiveCard>
        ))}
      </div>
    </EditorialSection>
  );
}
