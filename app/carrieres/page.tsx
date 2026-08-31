"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  EnvelopeSimpleIcon,
  LightbulbIcon,
  MapPinIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { Footer } from "../../components/Footer";
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from "@/components/ui/expandable-screen";
import { HustleApplicationModal } from "@/components/carrieres/HustleApplicationModal";
import {
  ImagePanel,
  InteractiveCard,
  Kicker,
  MarketingImage,
  SectionHeader,
} from "@/components/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/marketing/assets";
import { roogoMotion } from "@/lib/motion";

const hiringSignals = [
  "Opérations terrain et vérification des biens",
  "Partenariats propriétaires et agences",
  "Produit, contenu et expérience client",
];

const operatingPrinciples = [
  {
    icon: LightbulbIcon,
    title: "Initiative concrète",
    description:
      "Nous avançons avec des personnes capables d'identifier un problème, proposer une solution et la tester rapidement.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Exécution fiable",
    description:
      "La confiance de Roogo se gagne dans les détails: informations justes, suivi clair et engagements tenus.",
  },
  {
    icon: MapPinIcon,
    title: "Présence locale",
    description:
      "Notre produit doit comprendre Ouagadougou quartier par quartier, avec une équipe proche du terrain.",
  },
];

const teamMembers = [
  {
    name: "Salif Tankoano",
    role: "PDG",
    description: "Vision produit, partenariats et qualité de l'expérience.",
    image: "/salif.jpg",
  },
  {
    name: "Ablassé Zagre",
    role: "Directeur des visuels & communication",
    description: "Identité de marque, contenu, photographie et narration.",
  },
  {
    name: "Nanema Cosmos Ezechiel Don De DIEU",
    role: "Directeur marketing",
    description: "Stratégie marketing, croissance de marque et acquisition.",
  },
  {
    name: "Boukaré Zagré",
    role: "Directeur des ventes",
    description: "Croissance terrain et relations avec les propriétaires.",
  },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-[#f5efe6] text-neutral-950">
      <main>
        <section className="relative overflow-hidden bg-[#17120f] pt-32 text-white md:pt-36">
          <div className="absolute inset-0">
            <MarketingImage
              src={marketingAssets.teamEditorial.src}
              fallbackSrc={marketingAssets.teamEditorial.fallback}
              alt="Equipe Roogo en session de travail"
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-45"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#17120f] via-[#17120f]/80 to-[#17120f]/25" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#17120f] to-transparent" />
          </div>

          <div className="relative mx-auto grid min-h-[720px] w-full max-w-7xl items-end gap-12 px-6 pb-16 md:grid-cols-[1.15fr_0.85fr] md:pb-24">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={roogoMotion.deliberate}
            >
              <Kicker className="border-white/20 bg-white/10 text-white/80">
                Carrières Roogo
              </Kicker>
              <h1 className="mt-6 max-w-4xl text-5xl font-black leading-none tracking-tight md:text-7xl">
                Construire le standard immobilier du Burkina Faso.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75 md:text-xl">
                Roogo rassemble des profils terrain, produit et commerciaux pour
                rendre la location plus fiable, plus claire et plus rapide.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ExpandableScreen
                  layoutId="career-spontaneous-application-hero"
                  contentRadius="32px"
                >
                  <ExpandableScreenTrigger>
                  <motion.div
                    whileTap={{ scale: 0.985 }}
                    transition={roogoMotion.quick}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-4 text-sm font-black text-white shadow-2xl shadow-primary/25 transition hover:bg-primary-hover"
                  >
                    <EnvelopeSimpleIcon size={20} weight="bold" />
                    Candidature spontanée
                  </motion.div>
                </ExpandableScreenTrigger>
                  <ExpandableScreenContent
                    className="bg-neutral-50"
                    closeButtonClassName="text-neutral-400 hover:bg-neutral-200"
                  >
                    <HustleApplicationModal />
                  </ExpandableScreenContent>
                </ExpandableScreen>
                <Link
                  href="/a-propos"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-7 py-4 text-sm font-black text-white transition hover:bg-white/15"
                >
                  Comprendre Roogo
                  <ArrowRightIcon
                    size={18}
                    weight="bold"
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...roogoMotion.deliberate, delay: 0.12 }}
              className="rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-md"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/50">
                Nous recherchons surtout
              </p>
              <div className="mt-5 space-y-3">
                {hiringSignals.map((signal) => (
                  <motion.div
                    key={signal}
                    whileHover={{ x: 2, backgroundColor: "rgba(255,255,255,0.14)" }}
                    whileTap={{ scale: 0.99 }}
                    transition={roogoMotion.quick}
                    className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 text-sm font-bold text-white/80"
                  >
                    <CheckCircleIcon
                      size={20}
                      weight="fill"
                      className="mt-0.5 shrink-0 text-primary"
                    />
                    <span>{signal}</span>
                  </motion.div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-7 text-white/60">
                Les postes formels seront publiés progressivement. Les profils
                solides peuvent déjà se présenter avec une proposition précise.
              </p>
            </motion.div>
          </div>
        </section>

        <section className="py-24 md:py-32">
          <div className="mx-auto w-full max-w-7xl px-6">
            <SectionHeader
              kicker="Culture"
              title="Une équipe petite, directe, orientée terrain."
              description="Le marché immobilier local a besoin d'une exécution calme et rigoureuse. Notre culture privilégie les preuves, les retours clients et les décisions qui simplifient la vie des locataires comme des propriétaires."
            />

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {operatingPrinciples.map((principle) => {
                const Icon = principle.icon;

                return (
                  <InteractiveCard
                    key={principle.title}
                    className="rounded-[1.75rem] border border-black/10 bg-white p-7 shadow-sm hover:shadow-xl hover:shadow-[#5a321a]/10"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary/15">
                      <Icon size={25} weight="duotone" />
                    </div>
                    <h2 className="mt-6 text-xl font-black">
                      {principle.title}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-neutral-600">
                      {principle.description}
                    </p>
                  </InteractiveCard>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#17120f] py-24 text-white md:py-32">
          <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <ImagePanel className="relative min-h-[520px] overflow-hidden rounded-[2rem]">
              <MarketingImage
                src={marketingAssets.ownerWorkflow.src}
                fallbackSrc={marketingAssets.ownerWorkflow.fallback}
                alt="Équipe Roogo organisant un workflow propriétaire"
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.015]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-md">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-white/50">
                  Terrain + produit
                </p>
                <p className="mt-2 text-2xl font-black">
                  Une équipe qui vérifie, documente et suit.
                </p>
              </div>
            </ImagePanel>

            <div>
              <SectionHeader
                dark
                kicker="Equipe"
                title="Les personnes derriere Roogo."
                description="Nous construisons avec des profils complementaires: marque, commercial, operations et technologie. Chaque role doit renforcer la promesse centrale de Roogo: moins d'incertitude dans la recherche d'un logement."
              />

              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {teamMembers.map((member) => (
                  <InteractiveCard
                    key={member.name}
                    className="rounded-[1.5rem] border border-white/10 bg-white/10 p-5 hover:border-white/20 hover:bg-white/[0.12]"
                  >
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xl font-black text-white/50">
                      {member.image ? (
                        <MarketingImage
                          src={member.image}
                          fallbackSrc={member.image}
                          alt={member.name}
                          width={56}
                          height={56}
                          className="h-14 w-14 object-cover"
                        />
                      ) : (
                        <UsersThreeIcon size={27} weight="duotone" />
                      )}
                    </div>
                    <h3 className="mt-5 text-base font-black">
                      {member.name}
                    </h3>
                    <p className="mt-1 text-sm font-bold text-primary">
                      {member.role}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-white/60">
                      {member.description}
                    </p>
                  </InteractiveCard>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 md:py-32">
          <div className="mx-auto w-full max-w-7xl px-6">
            <div className="relative overflow-hidden rounded-[2rem] bg-neutral-950 p-8 text-white md:p-12">
              <div className="absolute inset-0 opacity-30">
                <MarketingImage
                  src={marketingAssets.finalCta.src}
                  fallbackSrc={marketingAssets.finalCta.fallback}
                  alt="Cour intérieure d'une maison Roogo"
                  fill
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/80 to-neutral-950/40" />
              <div className="relative max-w-2xl">
                <Kicker className="border-white/20 bg-white/10 text-white/80">
                  Candidature spontanée
                </Kicker>
                <h2 className="mt-5 text-3xl font-black leading-tight md:text-5xl">
                  Présentez une contribution claire.
                </h2>
                <p className="mt-5 text-base leading-8 text-white/70 md:text-lg">
                  Nous lisons les candidatures qui expliquent le probleme vise,
                  le resultat attendu et la maniere dont vous pouvez aider
                  Roogo à mieux servir le marché.
                </p>
                <div className="mt-8">
                  <ExpandableScreen
                    layoutId="career-spontaneous-application-final"
                    contentRadius="32px"
                  >
                    <ExpandableScreenTrigger>
                      <motion.div
                        whileTap={{ scale: 0.985 }}
                        transition={roogoMotion.quick}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-black text-neutral-950 transition hover:bg-white/90"
                      >
                        <EnvelopeSimpleIcon size={20} weight="bold" />
                        Envoyer ma candidature
                      </motion.div>
                    </ExpandableScreenTrigger>
                    <ExpandableScreenContent
                      className="bg-neutral-50"
                      closeButtonClassName="text-neutral-400 hover:bg-neutral-200"
                    >
                      <HustleApplicationModal />
                    </ExpandableScreenContent>
                  </ExpandableScreen>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
