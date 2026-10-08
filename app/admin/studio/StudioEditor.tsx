"use client";

import Image from "next/image";
import { FilmSlateIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { KIND_TABS, KindIcon } from "./StudioWorkspace";
import type { Artifact, PropertySummary } from "./studio-types";

/**
 * The editor: every piece of the project on the left, the chosen one large in
 * the middle, the running order underneath. Assembling the video comes later;
 * for now it shows what the video will be made of.
 */
export function StudioEditor({
  property,
  ordered,
  selectedId,
  onSelect,
}: {
  property: PropertySummary | null;
  ordered: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const visible = ordered.filter((a) => a.kind !== "script");
  const current =
    visible.find((a) => a.id === selectedId) ??
    visible.find((a) => a.kind === "image") ??
    visible[0] ??
    null;
  const voice = ordered.find((a) => a.kind === "voiceover");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <FilmSlateIcon size={18} weight="bold" className="text-primary" />
        <h2 className="text-sm font-semibold text-neutral-900">Éditeur</h2>
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500">
          Assemblage vidéo bientôt : l&apos;ordre ci-dessous est un plan
        </span>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-4 overflow-y-auto border-neutral-200 p-3 md:border-r">
          {KIND_TABS.filter((t) => t.kind !== "script").map((t) => {
            const items = ordered.filter((a) => a.kind === t.kind);
            return (
              <section key={t.kind} className="space-y-1.5">
                <h3 className="px-1 text-xs font-semibold text-neutral-500">
                  {t.label} ({items.length})
                </h3>
                {items.length === 0 ? (
                  <p className="px-1 text-xs text-neutral-400">Rien pour l&apos;instant.</p>
                ) : t.kind === "image" ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        title={item.title}
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-lg border-2 bg-neutral-100",
                          item.id === current?.id ? "border-primary" : "border-transparent",
                        )}
                      >
                        {item.url && (
                          <Image src={item.url} alt="" fill sizes="90px" unoptimized className="object-cover" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm",
                        item.id === current?.id ? "bg-primary/10 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100",
                      )}
                    >
                      <KindIcon kind={item.kind} size={16} />
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))
                )}
              </section>
            );
          })}
        </aside>

        <div className="flex min-h-0 items-center justify-center bg-[#faf7f4] p-4">
          {current?.kind === "image" && current.url ? (
            <div className="relative h-full max-h-[520px] w-full">
              <Image src={current.url} alt={current.title} fill sizes="700px" unoptimized className="object-contain" />
            </div>
          ) : current?.kind === "voiceover" && current.url ? (
            <div className="w-full max-w-lg space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-sm font-semibold text-neutral-900">{current.title}</p>
              <audio controls src={current.url} className="w-full" />
            </div>
          ) : current?.kind === "captions" ? (
            <pre className="max-h-full w-full max-w-lg overflow-y-auto whitespace-pre-wrap rounded-2xl border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-600">
              {current.text}
            </pre>
          ) : property?.image ? (
            <div className="relative h-full max-h-[520px] w-full">
              <Image src={property.image} alt="" fill sizes="700px" unoptimized className="object-contain opacity-60" />
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Les visuels et la voix du projet s&apos;afficheront ici.</p>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-200 p-3">
        <StudioTimeline
          ordered={ordered}
          selectedIds={[current?.id, voice?.id].filter((id): id is string => !!id && id === current?.id)}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold text-neutral-500">{children}</h2>;
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
      style={{
        left: `${left}%`,
        width: `calc(${width}% - 3px)`,
        ...(artifact.kind === "image" && artifact.url
          ? { backgroundImage: `url("${artifact.url}")`, backgroundSize: "cover", backgroundPosition: "center" }
          : {}),
      }}
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
    <section className="space-y-2">
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
            clip(image, (i * 100) / images.length, 100 / images.length, "border-white bg-neutral-200 text-transparent shadow-[0_0_0_1px_#e5e5e5]", `Image ${i + 1}`),
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
    <div className="flex h-9 items-center gap-2">
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
