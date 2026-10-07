"use client";

import Image from "next/image";
import {
  ClosedCaptioningIcon,
  FileTextIcon,
  HouseLineIcon,
  MusicNotesIcon,
  PushPinIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ArtifactCard, type CardProps } from "./ArtifactsPanel";
import type { Artifact, PropertySummary } from "./studio-types";

type Shared = Omit<CardProps, "artifact">;

type StageProps = Shared & {
  property: PropertySummary | null;
  ordered: Artifact[];
  preview: Artifact | null;
  script: Artifact | null;
  onSelect: (id: string) => void;
};

const KIND_LABEL: Record<Artifact["kind"], string> = {
  script: "Script",
  voiceover: "Voix",
  image: "Image",
  captions: "Sous-titres",
};

function KindIcon({ kind, size = 18 }: { kind: Artifact["kind"]; size?: number }) {
  if (kind === "script") return <FileTextIcon size={size} weight="bold" />;
  if (kind === "voiceover") return <WaveformIcon size={size} weight="bold" />;
  if (kind === "captions") return <ClosedCaptioningIcon size={size} weight="bold" />;
  return <HouseLineIcon size={size} weight="bold" />;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">
      {children}
    </h2>
  );
}

/** Preview on the left, the script on the right, every result underneath. */
export function StudioStage({
  property,
  ordered,
  preview,
  script,
  onSelect,
  ...shared
}: StageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col gap-2">
          <Heading>Aperçu</Heading>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {preview ? (
              <ArtifactCard artifact={preview} {...shared} />
            ) : (
              <PropertyPoster property={property} />
            )}
          </div>
        </section>
        <section className="flex min-h-0 flex-col gap-2">
          <Heading>Script</Heading>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {script ? (
              <ArtifactCard artifact={script} {...shared} />
            ) : (
              <Empty>
                Choisissez un bien et demandez un script. Il s&apos;affichera ici, prêt
                pour la voix.
              </Empty>
            )}
          </div>
        </section>
      </div>

      {ordered.length > 0 && (
        <section className="space-y-2">
          <Heading>Résultats ({ordered.length})</Heading>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ordered.map((artifact) => {
              const active = artifact.id === preview?.id || artifact.id === script?.id;
              return (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => onSelect(artifact.id)}
                  aria-pressed={active}
                  title={artifact.title}
                  className={cn(
                    "relative flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border bg-white text-neutral-500 transition-colors",
                    active ? "border-primary text-neutral-900" : "border-neutral-200 hover:border-neutral-300",
                  )}
                >
                  {artifact.kind === "image" && artifact.url ? (
                    <Image src={artifact.url} alt="" fill sizes="64px" unoptimized className="object-cover" />
                  ) : (
                    <>
                      <KindIcon kind={artifact.kind} />
                      <span className="text-[10px] font-bold">{KIND_LABEL[artifact.kind]}</span>
                    </>
                  )}
                  {artifact.pinned && (
                    <PushPinIcon
                      size={12}
                      weight="fill"
                      className="absolute right-1 top-1 text-primary"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm font-medium text-neutral-500">
      {children}
    </p>
  );
}

function PropertyPoster({ property }: { property: PropertySummary | null }) {
  if (!property?.image) {
    return (
      <Empty>Les affiches, voix et sous-titres créés apparaîtront ici en grand.</Empty>
    );
  }
  return (
    <div className="relative h-full min-h-60 overflow-hidden rounded-2xl border border-neutral-200">
      <Image src={property.image} alt="" fill sizes="600px" unoptimized className="object-cover opacity-80" />
      <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-neutral-900">
        Photo du bien
      </span>
      <span className="absolute inset-x-3 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-sm font-medium text-neutral-700">
        Créez une affiche ou une voix : le résultat s&apos;affichera ici.
      </span>
    </div>
  );
}

/* ---------- timeline ---------- */

const DEFAULT_SECONDS = 30;

function seconds(artifact: Artifact | undefined): number | null {
  const value = artifact?.meta?.duration_seconds;
  return typeof value === "number" && value > 0 ? value : null;
}

/**
 * What the video will be made of, laid out over the voice's length. It is a
 * plan to read, not an editor yet: assembling the video comes later.
 */
export function StudioTimeline({
  ordered,
  selectedIds,
  onSelect,
}: {
  ordered: Artifact[];
  selectedIds: string[];
  onSelect: (id: string) => void;
}) {
  const voice = ordered.find((a) => a.kind === "voiceover");
  const captions = ordered.find((a) => a.kind === "captions");
  const images = ordered.filter((a) => a.kind === "image");
  const total = Math.max(5, Math.ceil(seconds(voice) ?? DEFAULT_SECONDS));
  const step = total > 40 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);

  const clip = (artifact: Artifact, left: number, width: number, tone: string, label: string) => (
    <button
      key={artifact.id}
      type="button"
      onClick={() => onSelect(artifact.id)}
      title={artifact.title}
      style={{ left: `${left}%`, width: `calc(${width}% - 3px)` }}
      className={cn(
        "absolute inset-y-0 truncate rounded-md border px-2 text-left text-[11px] font-bold text-neutral-900",
        tone,
        selectedIds.includes(artifact.id) && "ring-2 ring-primary",
      )}
    >
      {label}
    </button>
  );

  return (
    <section className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <Heading>Chronologie</Heading>
        <span className="text-[11px] font-medium text-neutral-500">
          {voice ? `${total} s, d'après la voix` : "Durée estimée"} · montage vidéo bientôt
        </span>
      </div>
      <div className="ml-20 flex justify-between border-b border-neutral-200 pb-1 text-[10px] font-medium text-neutral-500">
        {ticks.map((t) => (
          <span key={t}>{t}s</span>
        ))}
      </div>
      <Track label="Images">
        {images.length ? (
          images.map((image, i) =>
            clip(image, (i * 100) / images.length, 100 / images.length, "border-amber-300 bg-amber-100", `Image ${i + 1}`),
          )
        ) : (
          <Placeholder>Aucune image</Placeholder>
        )}
      </Track>
      <Track label="Voix">
        {voice ? clip(voice, 0, 100, "border-green-300 bg-green-100", voice.title) : <Placeholder>Aucune voix</Placeholder>}
      </Track>
      <Track label="Sous-titres">
        {captions ? clip(captions, 0, 100, "border-violet-300 bg-violet-100", captions.title) : <Placeholder>Aucun sous-titre</Placeholder>}
      </Track>
      <Track label="Musique">
        <Placeholder>
          <MusicNotesIcon size={12} weight="bold" className="mr-1 inline" />
          Bientôt
        </Placeholder>
      </Track>
    </section>
  );
}

function Track({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-2">
      <span className="w-[72px] shrink-0 text-[11px] font-bold text-neutral-500">{label}</span>
      <div className="relative h-full flex-1">{children}</div>
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute inset-0 flex items-center rounded-md border border-dashed border-neutral-200 px-2 text-[11px] font-medium text-neutral-400">
      {children}
    </span>
  );
}
