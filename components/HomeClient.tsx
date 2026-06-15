"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  BuildingsIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  HouseLineIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  StorefrontIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Hero } from "./Hero";
import { PropertyCard } from "./PropertyCard";
import { Footer } from "./Footer";
import { Property } from "../lib/data";
import { Button } from "./ui/Button";
import {
  DarkSection,
  EditorialSection,
  MarketingImage,
  ProofStat,
  SectionHeader,
} from "./marketing/MarketingPrimitives";
import { marketingAssets } from "./marketing/assets";

interface HomeClientProps {
  featuredProperties: Property[];
}

const painPoints = [
  {
    icon: WarningCircleIcon,
    label: "Annonces douteuses",
    title: "La confiance se perd avant même la visite.",
    body: "Photos floues, prix incomplets, propriétaires difficiles à vérifier et mauvaises surprises au moment de se déplacer.",
  },
  {
    icon: ClockCounterClockwiseIcon,
    label: "Réponses lentes",
    title: "Les bons biens disparaissent pendant l'attente.",
    body: "Entre appels manqués, messages dispersés et disponibilité incertaine, les locataires perdent vite le fil.",
  },
  {
    icon: CalendarCheckIcon,
    label: "Visites compliquées",
    title: "La coordination devient le vrai obstacle.",
    body: "Roogo réduit les allers-retours inutiles en rendant le bien, les conditions et le prochain rendez-vous plus lisibles.",
  },
];

const roogoFlow = [
  {
    step: "01",
    title: "Annonce vérifiée",
    body: "Le bien est cadré avec des informations utiles, des photos plus claires et un statut exploitable.",
  },
  {
    step: "02",
    title: "Visite organisée",
    body: "Le locataire avance vers une visite ou un contact utile au lieu de multiplier les appels au hasard.",
  },
  {
    step: "03",
    title: "Dossier lisible",
    body: "Les conditions, le prix et les étapes de réservation restent visibles pour limiter les malentendus.",
  },
  {
    step: "04",
    title: "Paiement suivi",
    body: "Mobile money, reçus et accompagnement structurent la relation après la décision.",
  },
];

const ownerAudienceImage =
  marketingAssets.ownerHandoff ?? marketingAssets.ownerWorkflow;

const audiencePaths = [
  {
    icon: HouseLineIcon,
    title: "Locataires",
    body: "Cherchez par quartier, comparez les biens et avancez vers une visite avec moins d'incertitude.",
    image: marketingAssets.organizedVisit,
    href: "/proprietes",
    cta: "Voir les logements",
  },
  {
    icon: BuildingsIcon,
    title: "Propriétaires",
    body: "Présentez votre bien proprement et gardez les demandes dans un parcours plus sérieux.",
    image: ownerAudienceImage,
    href: "/proprietes",
    cta: "Publier un bien",
  },
  {
    icon: StorefrontIcon,
    title: "Commerces",
    body: "Trouvez un local visible pour lancer ou développer votre activité à Ouagadougou.",
    image: marketingAssets.commercialSpace,
    href: "/proprietes?category=Business",
    cta: "Voir les locaux",
  },
];

const trustQuestions = [
  {
    question: "Est-ce que les annonces sont vérifiées ?",
    answer:
      "Roogo met l'accent sur les informations utiles, les photos exploitables et les statuts de bien pour réduire les mauvaises surprises.",
  },
  {
    question: "Est-ce que je paie pour visiter ?",
    answer:
      "La recherche doit rester simple pour le locataire. Le site met en avant le principe de zéro frais de visite imposés.",
  },
  {
    question: "Est-ce utile pour les propriétaires ?",
    answer:
      "Oui. Le propriétaire gagne une présentation plus claire du bien et un flux de demandes plus structuré.",
  },
];

export default function HomeClient({ featuredProperties }: HomeClientProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.11,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 22 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen bg-[#f5efe6]">
      <main>
        <Hero />

        <EditorialSection>
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <SectionHeader
              kicker="Pipeline locatif"
              title="Là où la recherche de logement perd son élan."
              description="Le problème n'est pas seulement de trouver une annonce. C'est de savoir si elle est fiable, si le prix est clair, si la visite vaut le déplacement et si la suite est structurée."
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <ProofStat value="0 FCFA" label="frais de visite" />
              <ProofStat value="72h" label="mise en relation visée" />
              <ProofStat value="1 flow" label="recherche à suivi" />
            </div>
          </div>

          <motion.div
            className="mt-14 grid gap-5 md:grid-cols-3"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
          >
            {painPoints.map((point) => (
              <motion.article
                key={point.title}
                variants={item}
                className="rounded-[28px] border border-[#e7dacb] bg-white/70 p-6 shadow-sm"
              >
                <div className="mb-7 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <point.icon size={26} weight="duotone" />
                </div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                  {point.label}
                </p>
                <h3 className="mt-3 text-xl font-black leading-tight text-neutral-950">
                  {point.title}
                </h3>
                <p className="mt-4 text-sm font-medium leading-7 text-neutral-600">
                  {point.body}
                </p>
              </motion.article>
            ))}
          </motion.div>
        </EditorialSection>

        <DarkSection id="systeme-roogo">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center">
            <div>
              <SectionHeader
                dark
                kicker="Système Roogo"
                title="Un parcours plus clair entre l'annonce et la prochaine étape."
                description="Roogo transforme une recherche dispersée en séquence lisible pour le locataire comme pour le propriétaire."
              />

              <div className="mt-10 grid gap-4">
                {roogoFlow.map((step) => (
                  <div
                    key={step.step}
                    className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.06] p-5 sm:grid-cols-[72px_minmax(0,1fr)]"
                  >
                    <div className="text-2xl font-black text-primary">
                      {step.step}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm font-medium leading-7 text-white/60">
                        {step.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.06] p-3 shadow-2xl shadow-black/30">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-black/30">
                  <MarketingImage
                    src={marketingAssets.verification.src}
                    fallbackSrc={marketingAssets.verification.fallback}
                    alt="Vérification d'un bien immobilier Roogo"
                    fill
                    sizes="(max-width: 1024px) 100vw, 430px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-neutral-950">
                      <CheckCircleIcon size={18} weight="fill" />
                      Vérification en amont
                    </div>
                    <p className="mt-4 max-w-sm text-sm font-semibold leading-7 text-white/80">
                      Plus d&apos;éléments visibles avant de vous déplacer, moins de
                      décisions prises dans le flou.
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.06] p-3 shadow-2xl shadow-black/30">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-black/30">
                  <MarketingImage
                    src={marketingAssets.securePayment.src}
                    fallbackSrc={marketingAssets.securePayment.fallback}
                    alt="Paiement sécurisé Roogo"
                    fill
                    sizes="(max-width: 1024px) 100vw, 430px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-neutral-950">
                      <ShieldCheckIcon size={18} weight="fill" />
                      Paiement suivi
                    </div>
                    <p className="mt-4 max-w-sm text-sm font-semibold leading-7 text-white/80">
                      Une étape de règlement plus lisible, avec confirmation et
                      accompagnement après la décision.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DarkSection>

        <EditorialSection className="bg-white">
          <SectionHeader
            align="center"
            kicker="Parcours"
            title="Trois façons d'avancer avec Roogo."
            description="La même plateforme doit aider le locataire qui cherche vite, le propriétaire qui veut présenter son bien sérieusement, et le commerçant qui doit choisir un emplacement."
          />

          <motion.div
            className="mt-14 grid gap-6 lg:grid-cols-3"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
          >
            {audiencePaths.map((path) => (
              <motion.article
                key={path.title}
                variants={item}
                className="group overflow-hidden rounded-[30px] border border-neutral-200 bg-[#f8f5ef] shadow-sm"
              >
                <div className="relative aspect-[1.08] overflow-hidden">
                  <MarketingImage
                    src={path.image.src}
                    fallbackSrc={path.image.fallback}
                    alt={path.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 380px"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
                </div>
                <div className="p-6">
                  <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <path.icon size={26} weight="duotone" />
                  </div>
                  <h3 className="text-2xl font-black text-neutral-950">
                    {path.title}
                  </h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-neutral-600">
                    {path.body}
                  </p>
                  <Link
                    href={path.href}
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-primary"
                  >
                    {path.cta}
                    <ArrowRightIcon size={18} weight="bold" />
                  </Link>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </EditorialSection>

        <section className="bg-[#f5efe6] py-24 md:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <SectionHeader
                kicker="Annonces en vedette"
                title="Des biens à inspecter avec plus de contexte."
                description="Une sélection de propriétés disponibles pour démarrer la recherche avec des photos, prix et détails plus faciles à comparer."
              />
              <Link href="/proprietes">
                <Button variant="ghost" className="self-start font-black">
                  Voir toutes les propriétés
                  <ArrowRightIcon size={18} className="ml-2" weight="bold" />
                </Button>
              </Link>
            </div>

            <motion.div
              className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
            >
              {featuredProperties.map((property) => (
                <motion.div key={property.id} variants={item}>
                  <PropertyCard property={property} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <DarkSection className="py-20 md:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
            <SectionHeader
              dark
              kicker="Questions fréquentes"
              title="Conçu pour réduire l'incertitude, pas ajouter une couche de complexité."
              description="Roogo garde le parcours immobilier centré sur la confiance, la lisibilité et la prochaine action utile."
            />

            <div className="grid gap-4">
              {trustQuestions.map((item) => (
                <article
                  key={item.question}
                  className="rounded-[24px] border border-white/10 bg-white/[0.06] p-6"
                >
                  <h3 className="font-black text-white">{item.question}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-white/60">
                    {item.answer}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </DarkSection>

        <section className="relative overflow-hidden bg-neutral-950 px-3 py-3">
          <div className="relative mx-auto min-h-[520px] max-w-[1500px] overflow-hidden rounded-[30px]">
            <MarketingImage
              src={marketingAssets.finalCta.src}
              fallbackSrc={marketingAssets.finalCta.fallback}
              alt="Cour d'une maison disponible avec Roogo"
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,9,7,0.88),rgba(12,9,7,0.45),rgba(12,9,7,0.16)),linear-gradient(180deg,rgba(12,9,7,0.12),rgba(12,9,7,0.78))]" />
            <div className="relative flex min-h-[520px] max-w-3xl flex-col justify-end px-6 py-10 sm:px-12 lg:px-16">
              <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/70">
                <ShieldCheckIcon size={18} weight="fill" />
                Prochaine étape
              </div>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">
                Cherchez avec plus de preuves avant de vous déplacer.
              </h2>
              <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-white/70">
                Ouvrez les annonces disponibles ou présentez votre bien dans un
                parcours pensé pour garder la confiance et le suivi.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/proprietes">
                  <Button size="lg" className="w-full rounded-full font-black">
                    <MagnifyingGlassIcon size={22} className="mr-2" />
                    Voir les propriétés
                  </Button>
                </Link>
                <Link href="/proprietes">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full rounded-full bg-white text-neutral-950 hover:bg-white/90"
                  >
                    Publier un bien
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
