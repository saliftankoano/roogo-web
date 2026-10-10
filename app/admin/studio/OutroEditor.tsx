"use client";

import { ArrowCounterClockwiseIcon, CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { OutroText } from "@/lib/studio/video-templates";

const FIELDS: { key: keyof OutroText; label: string; placeholder?: string }[] = [
  { key: "headline", label: "Étiquette", placeholder: "VILLA À VENDRE" },
  { key: "location", label: "Lieu", placeholder: "Quartier, ville" },
  { key: "price", label: "Prix", placeholder: "50 000 000" },
  { key: "currency", label: "Devise", placeholder: "FCFA" },
  { key: "note", label: "Ligne de détail (facultatif)", placeholder: "300 m², une chambre, jardin" },
  { key: "contactLabel", label: "Phrase au-dessus du numéro" },
  { key: "phone", label: "Numéro" },
  { key: "footer", label: "Pied de page" },
];

/**
 * Everything on the outro is the team's to change (Salif, 2026-10-10): the
 * background photo and every line of text. The design itself (council
 * version D) stays fixed so every Roogo video ends the same way.
 */
export function OutroEditor({
  outro,
  photos,
  canWrite,
  onChange,
  onReset,
}: {
  outro: OutroText;
  photos: string[];
  canWrite: boolean;
  onChange: (next: OutroText) => void;
  onReset: () => void;
}) {
  const set = (key: keyof OutroText, value: string | null) => onChange({ ...outro, [key]: value });
  const field =
    "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary disabled:bg-neutral-50";

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h4 className="px-1 text-xs font-semibold text-neutral-500">Photo de fond</h4>
        <div role="radiogroup" aria-label="Photo de fond de la fin" className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={!outro.backgroundUrl}
            disabled={!canWrite}
            onClick={() => set("backgroundUrl", null)}
            title="Fond orange, sans photo"
            className={cn(
              "relative aspect-[9/16] cursor-pointer overflow-hidden rounded-lg bg-[linear-gradient(180deg,#cb7215,#a85c0e)] ring-offset-1 transition-shadow",
              !outro.backgroundUrl ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-neutral-300",
            )}
          >
            <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-semibold text-white/90">Orange</span>
            {!outro.backgroundUrl && <Check />}
          </button>
          {photos.map((photo, i) => {
            const active = outro.backgroundUrl === photo;
            return (
              <button
                key={photo}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`Photo ${i + 1}`}
                disabled={!canWrite}
                onClick={() => set("backgroundUrl", photo)}
                className={cn(
                  "relative aspect-[9/16] cursor-pointer overflow-hidden rounded-lg bg-neutral-100 ring-offset-1 transition-shadow",
                  active ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-neutral-300",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" className="size-full object-cover" />
                {active && <Check />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h4 className="text-xs font-semibold text-neutral-500">Texte</h4>
          {canWrite && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-800"
            >
              <ArrowCounterClockwiseIcon size={12} weight="bold" className="size-3" />
              Reprendre l&apos;annonce
            </button>
          )}
        </div>
        <div className="grid gap-2">
          {FIELDS.map((f) => (
            <label key={f.key} className={cn("grid gap-1", (f.key === "price" || f.key === "currency") && "inline-grid")}>
              <span className="px-1 text-[11px] font-medium text-neutral-500">{f.label}</span>
              <input
                id={`outro-${f.key}`}
                className={field}
                value={(outro[f.key] as string | null | undefined) ?? ""}
                placeholder={f.placeholder}
                disabled={!canWrite}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="px-1 text-[11px] text-neutral-400">Une ligne laissée vide disparaît de la fin.</p>
      </section>
    </div>
  );
}

function Check() {
  return (
    <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-white">
      <CheckIcon size={10} weight="bold" className="size-2.5" />
    </span>
  );
}
