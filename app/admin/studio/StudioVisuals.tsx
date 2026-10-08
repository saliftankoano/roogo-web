"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageSquareIcon, PlusIcon, PushPinIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ArtifactCard, type CardProps } from "./ArtifactsPanel";
import { ToolsPanel } from "./StudioTools";
import type { Artifact, ConversationDetail, JobTool, RunningJob } from "./studio-types";

type Money = (usd: number) => string;
type StartResult = { ok: true } | { ok: false; error: string };

/**
 * Visuals are their own work: an October greeting, a poster, a cut-out. They
 * live in a project like everything else (so they show in Projets with who
 * made them) but never go into a video. With a property chosen, the property
 * tools are offered too.
 */
export function StudioVisuals({
  detail,
  canWrite,
  money,
  jobs,
  message,
  start,
  onNewVisualProject,
  creating,
  card,
}: {
  detail: ConversationDetail | null;
  canWrite: boolean;
  money: Money;
  jobs: RunningJob[];
  message: string | null;
  start: (tool: JobTool, params: Record<string, unknown>, estimateUsd: number) => Promise<StartResult>;
  onNewVisualProject: () => void;
  creating: boolean;
  card: Omit<CardProps, "artifact">;
}) {
  const images = (detail?.artifacts ?? []).filter((a) => a.kind === "image").reverse();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current: Artifact | null = images.find((a) => a.id === selectedId) ?? images[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <ImageSquareIcon size={18} weight="bold" className="shrink-0 text-primary" />
        <h2 className="text-sm font-semibold text-neutral-900">Visuels</h2>
        <span className="min-w-0 truncate text-xs text-neutral-500">
          {detail ? detail.conversation.title : "Aucun projet ouvert"}
        </span>
        <button
          type="button"
          onClick={onNewVisualProject}
          disabled={creating}
          className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          <PlusIcon size={16} weight="bold" className="size-4 shrink-0" />
          Nouveau visuel
        </button>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-3 overflow-y-auto border-neutral-200 p-3 md:border-r">
          {detail && canWrite ? (
            <ToolsPanel
              conversationId={detail.conversation.id}
              property={detail.property}
              money={money}
              refreshKey={detail.artifacts.length}
              jobs={jobs}
              message={message}
              start={start}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
              {detail
                ? "Ce projet appartient à un collègue. Créez un nouveau visuel pour travailler."
                : "Créez un nouveau visuel : il sera enregistré comme un projet, avec votre nom et la date."}
            </p>
          )}
          {!detail?.property && detail && canWrite && (
            <p className="px-1 text-xs text-neutral-500">
              Sans bien choisi, seules les affiches libres (voeux, annonces) sont proposées. Choisissez un bien en haut de
              la page pour l&apos;affiche du bien et le détourage.
            </p>
          )}
          {images.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="px-1 text-xs font-semibold text-neutral-500">Visuels du projet ({images.length})</h3>
              <div className="grid grid-cols-3 gap-1.5">
                {images.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={item.id === current?.id}
                    title={item.title}
                    className={cn(
                      "relative aspect-[4/5] overflow-hidden rounded-lg border-2 bg-neutral-100 transition-colors",
                      item.id === current?.id ? "border-primary" : "border-transparent hover:border-neutral-300",
                    )}
                  >
                    {item.url && <Image src={item.url} alt={item.title} fill sizes="96px" unoptimized className="object-cover" />}
                    {item.pinned && (
                      <PushPinIcon size={12} weight="fill" className="absolute right-1 top-1 shrink-0 text-primary drop-shadow" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>

        <div className="min-h-0 overflow-y-auto bg-[#faf7f4] p-4 md:p-6">
          {current ? (
            <div className="mx-auto max-w-md">
              <ArtifactCard artifact={current} {...card} />
            </div>
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center text-neutral-400">
              <ImageSquareIcon size={28} weight="bold" />
              <p className="max-w-xs text-sm">Les visuels créés ici s&apos;affichent en grand.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
