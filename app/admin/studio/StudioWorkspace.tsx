"use client";

import Image from "next/image";
import {
  ClosedCaptioningIcon,
  FileTextIcon,
  ImageSquareIcon,
  PushPinIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ArtifactCard, type CardProps } from "./ArtifactsPanel";
import type { Artifact } from "./studio-types";

export type ArtifactKind = Artifact["kind"];

export const KIND_TABS: { kind: ArtifactKind; label: string; empty: string }[] = [
  {
    kind: "script",
    label: "Scripts",
    empty: "Aucun script pour l'instant. Demandez-en un dans la conversation.",
  },
  {
    kind: "voiceover",
    label: "Voix",
    empty: "Aucune voix. Ouvrez un script et cliquez sur « Générer la voix ».",
  },
  {
    kind: "image",
    label: "Visuels",
    empty: "Aucun visuel. Créez une affiche ou détourez une photo ci-contre.",
  },
  {
    kind: "captions",
    label: "Sous-titres",
    empty: "Aucun sous-titre. Ouvrez une voix et cliquez sur « Sous-titres ».",
  },
];

export function KindIcon({ kind, size = 18 }: { kind: ArtifactKind; size?: number }) {
  if (kind === "script") return <FileTextIcon size={size} weight="bold" />;
  if (kind === "voiceover") return <WaveformIcon size={size} weight="bold" />;
  if (kind === "captions") return <ClosedCaptioningIcon size={size} weight="bold" />;
  return <ImageSquareIcon size={size} weight="bold" />;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = Omit<CardProps, "artifact"> & {
  kind: ArtifactKind;
  onKind: (kind: ArtifactKind) => void;
  ordered: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Shown above the list: voice choice on "Voix", creation tools on "Visuels". */
  aside?: React.ReactNode;
  /** Shown above a script, to pick the voice before generating. */
  scriptHeader?: React.ReactNode;
};

/** One kind of result at a time: a list on the left, the chosen one open on the right. */
export function StudioWorkspace({
  kind,
  onKind,
  ordered,
  selectedId,
  onSelect,
  aside,
  scriptHeader,
  ...card
}: Props) {
  const items = ordered.filter((a) => a.kind === kind);
  const current = items.find((a) => a.id === selectedId) ?? items[0] ?? null;
  const tab = KIND_TABS.find((t) => t.kind === kind)!;

  return (
    <div className="flex flex-col">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-3 pt-2">
        {KIND_TABS.map((t) => {
          const count = ordered.filter((a) => a.kind === t.kind).length;
          const active = t.kind === kind;
          return (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onKind(t.kind)}
              className={cn(
                "-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
                active
                  ? "border-primary text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800",
              )}
            >
              <KindIcon kind={t.kind} size={16} />
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-primary/10 text-primary" : "bg-neutral-100 text-neutral-500",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid flex-1 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 border-neutral-200 p-3 md:border-r">
          {aside}
          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
              {tab.empty}
            </p>
          ) : kind === "image" ? (
            <div className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-pressed={item.id === current?.id}
                  title={item.title}
                  className={cn(
                    "relative aspect-[4/5] overflow-hidden rounded-xl border-2 bg-neutral-100 transition-colors",
                    item.id === current?.id ? "border-primary" : "border-transparent hover:border-neutral-300",
                  )}
                >
                  {item.url && (
                    <Image src={item.url} alt={item.title} fill sizes="140px" unoptimized className="object-cover" />
                  )}
                  {item.pinned && (
                    <PushPinIcon size={14} weight="fill" className="absolute right-1.5 top-1.5 text-primary drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={item.id === current?.id}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                      item.id === current?.id ? "bg-primary/10" : "hover:bg-neutral-100",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        item.id === current?.id ? "bg-white text-primary" : "bg-neutral-100 text-neutral-500",
                      )}
                    >
                      <KindIcon kind={item.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900">{item.title}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {item.kind === "script" ? item.text.slice(0, 60) : when(item.createdAt)}
                      </span>
                    </span>
                    {item.pinned && <PushPinIcon size={14} weight="fill" className="shrink-0 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[#faf7f4] p-4 md:p-6">
          {current ? (
            <div className={cn("mx-auto space-y-3", kind === "image" ? "max-w-md" : "max-w-2xl")}>
              {kind === "script" && scriptHeader}
              <ArtifactCard artifact={current} {...card} />
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-neutral-400">
              <KindIcon kind={kind} size={28} />
              <p className="max-w-xs text-sm">{tab.empty}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
