import { Footer } from "../../components/Footer";
import { Metadata } from "next";
import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { getAboutPageSchema } from "../../lib/schemas";
import {
  DarkSection,
  EditorialSection,
  ImagePanel,
  InteractiveCard,
  MarketingImage,
  ProofStat,
  SectionHeader,
} from "../../components/marketing/MarketingPrimitives";
import { marketingAssets } from "../../components/marketing/assets";

export const metadata: Metadata = {
  title: "À propos - Révolutionner l'Immobilier au Burkina Faso",
  description:
    "Découvrez Roogo, la plateforme qui simplifie la location immobilière au Burkina Faso grâce à l'innovation, la transparence et la qualité.",
};

const principles = [
  {
    title: "Rendre le bien lisible",
    body: "Une annonce doit donner assez de contexte pour décider si une visite vaut le temps du locataire.",
  },
  {
    title: "Réduire les mauvaises surprises",
    body: "Prix, photos, conditions et statut du bien doivent avancer dans le même sens.",
  },
  {
    title: "Structurer la relation",
    body: "Le propriétaire et le locataire gagnent quand la prochaine étape est claire et suivie.",
  },
];

export default function AboutPage() {
  const proofImage =
    marketingAssets.propertyPhotography ?? marketingAssets.verification;
  const neighborhoodImage =
    marketingAssets.neighborhood ?? marketingAssets.finalCta;

  return (
    <div className="min-h-screen bg-[#f5efe6]">
      <JsonLd schema={getAboutPageSchema()} />
      <main>
        <section className="relative overflow-hidden bg-[#17120f] px-3 pb-3 pt-28 sm:px-6 lg:pt-32">
          <div className="relative mx-auto grid min-h-[620px] max-w-[1500px] overflow-hidden rounded-[30px] border border-white/10 bg-neutral-950 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="relative z-10 flex flex-col justify-end px-6 py-10 sm:px-10 lg:px-14">
              <div className="mb-5 inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/70">
                À propos
              </div>
              <h1 className="max-w-3xl text-5xl font-black leading-[0.98] tracking-tight text-white md:text-7xl">
                Une location plus claire pour le Burkina Faso.
              </h1>
              <p className="mt-7 max-w-2xl text-base font-medium leading-8 text-white/70 md:text-lg">
                Roogo est né d&apos;une conviction simple : chercher un logement
                ne doit pas être un parcours d&apos;incertitude. La plateforme
                rapproche propriétaires et locataires autour de preuves plus
                visibles, d&apos;étapes mieux coordonnées et d&apos;un suivi plus
                fiable.
              </p>
            </div>
            <div className="relative min-h-[360px] lg:min-h-full">
              <MarketingImage
                src={marketingAssets.teamEditorial.src}
                fallbackSrc={marketingAssets.teamEditorial.fallback}
                alt="Équipe Roogo préparant des annonces immobilières"
                fill
                sizes="(max-width: 1024px) 100vw, 740px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#17120f] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#17120f] lg:via-transparent lg:to-transparent" />
            </div>
          </div>
        </section>

        <EditorialSection>
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <SectionHeader
              kicker="Mission"
              title="Transformer l'expérience immobilière en parcours de confiance."
              description="Nous voulons connecter les propriétaires, agents et locataires de manière transparente, efficace et sécurisée, en utilisant la technologie pour lever les barrières traditionnelles du marché."
            />
            <div className="grid gap-5">
              {principles.map((principle) => (
                <InteractiveCard
                  key={principle.title}
                  className="rounded-[28px] border border-[#e7dacb] bg-white/70 p-7 hover:shadow-xl hover:shadow-[#5a321a]/10"
                >
                  <h2 className="text-2xl font-black text-neutral-950">
                    {principle.title}
                  </h2>
                  <p className="mt-3 text-base font-medium leading-8 text-neutral-600">
                    {principle.body}
                  </p>
                </InteractiveCard>
              ))}
            </div>
          </div>
        </EditorialSection>

        <DarkSection>
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <ImagePanel className="relative aspect-[4/3] overflow-hidden rounded-[30px] border border-white/10 bg-white/5">
              <MarketingImage
                src={proofImage.src}
                fallbackSrc={proofImage.fallback}
                alt="Photographie professionnelle d'un bien Roogo"
                loading="lazy"
                fill
                sizes="(max-width: 1024px) 100vw, 620px"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </ImagePanel>
            <div>
              <SectionHeader
                dark
                kicker="Pourquoi Roogo"
                title="Le marché a besoin de plus que des annonces."
                description="Le manque de visibilité, les visites improvisées et les informations incomplètes créent de la friction. Roogo répond avec une expérience plus structurée."
              />
              <div className="mt-10 grid gap-5 sm:grid-cols-3">
                <ProofStat dark value="Photos" label="plus exploitables" />
                <ProofStat dark value="Visites" label="mieux cadrées" />
                <ProofStat dark value="Prix" label="plus lisibles" />
              </div>
            </div>
          </div>
        </DarkSection>

        <EditorialSection className="bg-white">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <ImagePanel className="relative min-h-[440px] overflow-hidden rounded-[30px]">
              <MarketingImage
                src={neighborhoodImage.src}
                fallbackSrc={neighborhoodImage.fallback}
                alt="Quartier résidentiel à Ouagadougou"
                fill
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            </ImagePanel>

            <div>
              <SectionHeader
                kicker="Vision"
                title="Construire la référence immobilière en Afrique de l'Ouest."
                description="Roogo commence au Burkina Faso avec une ambition simple : rendre l'immobilier synonyme de confiance, de simplicité et de suivi concret pour chaque partie."
              />
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/proprietes"
                  className="rounded-full bg-neutral-950 px-7 py-4 text-sm font-black text-white transition-colors hover:bg-primary"
                >
                  Explorer les propriétés
                </Link>
                <Link
                  href="/nous-contacter"
                  className="rounded-full border border-neutral-200 px-7 py-4 text-sm font-black text-neutral-950 transition-colors hover:border-primary hover:text-primary"
                >
                  Contacter Roogo
                </Link>
              </div>
            </div>
          </div>
        </EditorialSection>
      </main>
      <Footer />
    </div>
  );
}
