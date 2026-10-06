"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  HouseLineIcon,
  PhoneXIcon,
  PlayCircleIcon,
  ReceiptIcon,
  WalletIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  DarkSection,
  EditorialSection,
  InteractiveCard,
  Kicker,
  Reveal,
  SectionHeader,
} from "@/components/marketing/MarketingPrimitives";

// Script and shot list: vault 04 Marketing/Playbooks/Owner VSL script.
const VSL_VIDEO_SRC: string | null = "/api/media/vsl-proprietaires";
const VSL_POSTER_SRC = "/marketing/roogo-owner-handoff.jpg";

const WHATSAPP_URL =
  "https://wa.me/22667006116?text=Bonjour%20Roogo%2C%20je%20suis%20propri%C3%A9taire%20et%20je%20veux%20publier%20mon%20bien.";
const LISTING_URL = "/annonces/creer";

const pains = [
  {
    icon: ClockCounterClockwiseIcon,
    title: "Le bien reste vide",
    body: "Chaque mois sans locataire, c'est un loyer qui ne rentre pas. Le panneau « à louer » ne travaille pas pour vous.",
  },
  {
    icon: PhoneXIcon,
    title: "Les appels ne mènent à rien",
    body: "Des dizaines d'appels, des visites annulées, des gens qui ne viennent pas et ne répondent plus.",
  },
  {
    icon: WarningCircleIcon,
    title: "Le loyer se court après",
    body: "Se déplacer pour encaisser, relancer, négocier un retard. Du temps perdu et des tensions.",
  },
];

const steps = [
  {
    icon: HouseLineIcon,
    title: "Vous publiez en quelques minutes",
    body: "Photos, prix, quartier. Les frais exacts s'affichent avant que vous confirmiez.",
  },
  {
    icon: CheckCircleIcon,
    title: "Roogo vous amène des locataires",
    body: "Les candidats vous contactent et les visites sont organisées. Vous choisissez.",
  },
  {
    icon: WalletIcon,
    title: "Le loyer arrive par mobile money",
    body: "Orange Money ou Moov Money. Fini les déplacements pour encaisser.",
  },
  {
    icon: ReceiptIcon,
    title: "Vous gardez une trace de tout",
    body: "Reçus et suivi des paiements, pour qu'il n'y ait pas de malentendu.",
  },
];

const objections = [
  {
    q: "Combien ça coûte vraiment ?",
    a: "0 FCFA aujourd'hui. Si Roogo vous trouve un locataire et encaisse le premier loyer, les frais de mise en relation sont de 50 % du loyer mensuel annoncé, une seule fois. Ensuite, la collecte des loyers coûte 7 % sur chaque loyer encaissé via Roogo. Vous voyez le montant exact avant de publier.",
  },
  {
    q: "Et si Roogo ne me trouve personne ?",
    a: "Vous ne payez rien pour la mise en relation. Les frais de 50 % ne s'appliquent que si Roogo amène le locataire et encaisse le premier loyer.",
  },
  {
    q: "Je préfère payer une fois et être tranquille.",
    a: "C'est possible avec les packs de publication : Essentiel 15 000 FCFA, Standard 25 000 FCFA, Premium 45 000 FCFA. Avec un pack, il n'y a pas de frais de 50 % sur le premier loyer. Les 7 % sur les loyers encaissés via Roogo restent applicables si vous utilisez la collecte.",
  },
  {
    q: "Et si je ne veux pas que Roogo encaisse mes loyers ?",
    a: "Vous pouvez désactiver la collecte pour les échéances futures. Les frais de mise en relation déjà dus restent dus.",
  },
  {
    q: "J'ai déjà un locataire.",
    a: "Si vous créez vous-même le contrat avec un locataire que Roogo n'a pas trouvé, les frais de mise en relation ne s'appliquent pas.",
  },
];

function VslPlayer() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
      {VSL_VIDEO_SRC ? (
        <video
          className="h-full w-full object-cover"
          src={VSL_VIDEO_SRC}
          poster={VSL_POSTER_SRC}
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-3 bg-cover bg-center text-white"
          style={{
            backgroundImage: `linear-gradient(rgba(23,18,15,0.65), rgba(23,18,15,0.65)), url(${VSL_POSTER_SRC})`,
          }}
        >
          <PlayCircleIcon size={64} weight="fill" aria-hidden="true" />
          <p className="px-6 text-center text-sm font-semibold md:text-base">
            La vidéo arrive bientôt
          </p>
        </div>
      )}
    </div>
  );
}

function CtaRow({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link
        href={LISTING_URL}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-primary-hover"
      >
        Publier mon bien
        <ArrowRightIcon size={20} weight="bold" aria-hidden="true" />
      </Link>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center rounded-full border px-8 py-4 text-lg font-semibold transition-colors ${
          dark
            ? "border-white/25 text-white hover:bg-white/10"
            : "border-neutral-300 text-neutral-900 hover:bg-neutral-100"
        }`}
      >
        Nous écrire sur WhatsApp
      </a>
    </div>
  );
}

export function OwnerVsl() {
  return (
    <>
      {/* 1. Promise */}
      <DarkSection className="pt-32 md:pt-40">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <Kicker className="border-white/15 bg-white/10 text-white/80">
              Pour les propriétaires
            </Kicker>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight md:text-6xl">
              Votre bien loué. Votre loyer encaissé. Sans courir après personne.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/70 md:text-lg">
              Regardez comment Roogo vous amène des locataires et encaisse vos
              loyers par mobile money. 0 FCFA aujourd&apos;hui.
            </p>
          </Reveal>
          <div className="mt-10">
            <VslPlayer />
          </div>
          <div className="mt-8 flex justify-center">
            <CtaRow dark />
          </div>
        </div>
      </DarkSection>

      {/* 2. Pains */}
      <EditorialSection>
        <SectionHeader
          kicker="Vous connaissez ça"
          title="Louer un bien ne devrait pas être un deuxième travail."
          description="Trois problèmes que presque tous les propriétaires à Ouagadougou ont déjà vécus."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {pains.map((p) => (
            <InteractiveCard key={p.title} className="rounded-3xl border border-neutral-200 bg-white p-6">
              <p.icon size={32} weight="duotone" className="text-primary" />
              <h3 className="mt-4 text-xl font-black text-neutral-950">
                {p.title}
              </h3>
              <p className="mt-3 leading-7 text-neutral-600">{p.body}</p>
            </InteractiveCard>
          ))}
        </div>
      </EditorialSection>

      {/* 3. Mechanism and proof */}
      <DarkSection>
        <SectionHeader
          dark
          kicker="Comment ça marche"
          title="Quatre étapes, et chaque montant est visible."
          description="Pas de promesse vague. Voici ce qui se passe, dans l'ordre."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="rounded-3xl border border-white/10 bg-white/5 p-6"
            >
              <div className="flex items-center justify-between">
                <s.icon size={32} weight="duotone" className="text-primary" />
                <span className="text-sm font-black text-white/40">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-black">{s.title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/70">{s.body}</p>
            </div>
          ))}
        </div>
      </DarkSection>

      {/* 4. Objections */}
      <EditorialSection>
        <SectionHeader
          kicker="Vos questions"
          title="Les frais, en toute clarté."
          description="Les montants qui comptent, sans lettres en petits caractères."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {objections.map((o) => (
            <details
              key={o.q}
              className="group rounded-2xl border border-neutral-200 bg-white p-6"
            >
              <summary className="cursor-pointer list-none text-lg font-black text-neutral-950">
                {o.q}
              </summary>
              <p className="mt-3 leading-7 text-neutral-600">{o.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-neutral-500">
          Les conditions détaillées s&apos;affichent et s&apos;acceptent avant
          chaque publication.
        </p>
      </EditorialSection>

      {/* 5. The ask */}
      <DarkSection>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black leading-tight md:text-5xl">
            Publiez votre bien aujourd&apos;hui. 0 FCFA pour commencer.
          </h2>
          <p className="mt-5 text-white/70">
            Ça prend quelques minutes. Si vous préférez en parler, écrivez-nous
            sur WhatsApp ou appelez le +226 67 00 61 16.
          </p>
          <div className="mt-8 flex justify-center">
            <CtaRow dark />
          </div>
        </div>
      </DarkSection>
    </>
  );
}
