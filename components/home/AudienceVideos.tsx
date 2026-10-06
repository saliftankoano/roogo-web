"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { useState } from "react";
import { PlayCircleIcon } from "@phosphor-icons/react";
import {
  EditorialSection,
  MarketingImage,
  SectionHeader,
} from "@/components/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/marketing/assets";

type Audience = "owner" | "renter";

const audiences: Record<
  Audience,
  {
    tab: string;
    title: string;
    body: string;
    duration: string;
    video: string;
    poster: { src: string; fallback: string };
    posterAlt: string;
    primary: { href: string; label: string };
    secondary: { href: string; label: string };
  }
> = {
  owner: {
    tab: "Je loue mon bien",
    title: "Votre bien loué. Votre loyer encaissé.",
    body: "0 FCFA aujourd'hui. Roogo vous amène des locataires et encaisse les loyers par mobile money, avec reçus.",
    duration: "1 min 21",
    video: "/api/media/vsl-proprietaires",
    poster: marketingAssets.ownerHandoff ?? marketingAssets.ownerWorkflow,
    posterAlt: "Propriétaire remettant les clés d'un bien loué avec Roogo",
    primary: { href: "/annonces/creer", label: "Publier mon bien" },
    secondary: { href: "/proprietaires", label: "Voir comment ça marche" },
  },
  renter: {
    tab: "Je cherche un logement",
    title: "Trouvez votre maison sans courir partout.",
    body: "Des annonces examinées avant leur mise en ligne. Demandez une visite et visitez sans rien payer. Si le logement vous plaît, payez la caution et le loyer en ligne par mobile money, avec reçu.",
    duration: "48 secondes",
    video: "/api/media/vsl-locataires",
    poster: marketingAssets.organizedVisit,
    posterAlt: "Locataire visitant un logement organisé avec Roogo",
    primary: { href: "/proprietes", label: "Voir les logements" },
    secondary: { href: "/app", label: "Télécharger l'application" },
  },
};

export function AudienceVideos() {
  const [audience, setAudience] = useState<Audience>("owner");
  const [playing, setPlaying] = useState<Record<Audience, boolean>>({
    owner: false,
    renter: false,
  });
  const current = audiences[audience];

  const selectAudience = (next: Audience) => {
    if (next === audience) return;
    setAudience(next);
    posthog.capture("home_video_audience_selected", { audience: next });
  };

  const startPlaying = () => {
    setPlaying((state) => ({ ...state, [audience]: true }));
    posthog.capture("home_video_play", { audience });
  };

  return (
    <EditorialSection id="en-video" className="py-16 md:py-24">
      <SectionHeader
        kicker="En vidéo"
        title="Choisissez votre parcours."
        description="Propriétaire ou locataire, voyez en quelques instants ce que Roogo change pour vous."
      />

      <div
        role="tablist"
        aria-label="Choisir une vidéo"
        className="mt-8 inline-flex rounded-full border border-[#e7dacb] bg-white/70 p-1"
      >
        {(Object.keys(audiences) as Audience[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={audience === key}
            onClick={() => selectAudience(key)}
            className={`rounded-full px-5 py-2.5 text-sm font-black transition-colors ${
              audience === key
                ? "bg-primary text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {audiences[key].tab}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-xl">
          {playing[audience] ? (
            <video
              key={audience}
              className="h-full w-full object-cover"
              src={current.video}
              controls
              autoPlay
              playsInline
              preload="none"
              onEnded={() =>
                posthog.capture("home_video_complete", { audience })
              }
            />
          ) : (
            <button
              type="button"
              onClick={startPlaying}
              aria-label={`Lancer la vidéo : ${current.tab}`}
              className="group absolute inset-0 block h-full w-full"
            >
              <MarketingImage
                src={current.poster.src}
                fallbackSrc={current.poster.fallback}
                alt={current.posterAlt}
                fill
                sizes="(min-width: 1024px) 720px, 100vw"
                className="object-cover"
              />
              <span className="absolute inset-0 bg-black/35 transition-colors group-hover:bg-black/25" />
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <PlayCircleIcon size={72} weight="fill" aria-hidden="true" />
                <span className="text-sm font-black">
                  Lancer la vidéo, {current.duration}
                </span>
              </span>
            </button>
          )}
        </div>

        <div>
          <h3 className="text-2xl font-black leading-tight text-neutral-950 md:text-3xl">
            {current.title}
          </h3>
          <p className="mt-4 text-base font-medium leading-8 text-neutral-600">
            {current.body}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={current.primary.href}
              onClick={() =>
                posthog.capture("home_video_cta_click", {
                  audience,
                  target: current.primary.href,
                })
              }
              className="inline-flex items-center justify-center rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              {current.primary.label}
            </Link>
            <Link
              href={current.secondary.href}
              onClick={() =>
                posthog.capture("home_video_cta_click", {
                  audience,
                  target: current.secondary.href,
                })
              }
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-7 py-3.5 text-base font-semibold text-neutral-900 transition-colors hover:bg-neutral-100"
            >
              {current.secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </EditorialSection>
  );
}
