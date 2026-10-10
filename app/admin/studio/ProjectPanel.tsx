"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRightIcon,
  ArrowsLeftRightIcon,
  CaretRightIcon,
  ClosedCaptioningIcon,
  FileTextIcon,
  FilmSlateIcon,
  HouseLineIcon,
  ImageSquareIcon,
  MicrophoneStageIcon,
  PushPinIcon,
  SidebarSimpleIcon,
  TranslateIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { StudioCurrency } from "@/lib/studio/currency";
import type { VoiceInfo } from "./VoicePicker";
import type { Artifact, Budget, ConversationDetail } from "./studio-types";

export type CenterView = "chat" | "editor" | "visuals" | "glossary" | "voices" | "voiceover" | "clone";

const ease = [0.22, 1, 0.36, 1] as const;

const KIND_ICON = {
  script: FileTextIcon,
  voiceover: WaveformIcon,
  image: ImageSquareIcon,
  captions: ClosedCaptioningIcon,
  video: FilmSlateIcon,
} as const;

function pinnedLabel(a: Artifact, scripts: Artifact[]) {
  if (a.kind === "script") return `Script v${scripts.findIndex((s) => s.id === a.id) + 1}`;
  return a.title;
}

/**
 * The open project: what it holds and what you can do with it. A summary and
 * a list of actions only (council, 2026-10-09): it never becomes a second
 * workspace, the work happens in the centre.
 */
export function ProjectPanel({
  detail,
  collapsed,
  onToggle,
  view,
  onView,
  budget,
  money,
  currency,
  onCurrency,
  cloningEnabled,
  canWrite,
  onSwitchProperty,
  onJump,
}: {
  detail: ConversationDetail | null;
  collapsed: boolean;
  onToggle: () => void;
  view: CenterView;
  onView: (view: CenterView) => void;
  budget: Budget | null;
  money: (usd: number) => string;
  currency: StudioCurrency;
  onCurrency: () => void;
  voices: VoiceInfo[];
  voice: string;
  onVoice: (key: string) => void;
  cloningEnabled: boolean;
  canWrite: boolean;
  onSwitchProperty: () => void;
  onJump: (artifactId: string) => void;
}) {
  const [open, setOpen] = useState<"pinned" | null>("pinned");
  const property = detail?.property ?? null;
  const artifacts = detail?.artifacts ?? [];
  const scripts = artifacts.filter((a) => a.kind === "script").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pinned = artifacts.filter((a) => a.pinned).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const action = (
    key: string,
    label: string,
    Icon: typeof FileTextIcon,
    onClick: () => void,
    opts: { active?: boolean; expandable?: boolean; expanded?: boolean } = {},
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-expanded={opts.expandable ? opts.expanded : undefined}
      className={cn(
        "flex shrink-0 cursor-pointer items-center rounded-full border text-[15px] font-semibold transition-[background-color,border-color,color] duration-150",
        collapsed ? "size-11 justify-center self-center" : "h-12 w-full gap-3 px-4",
        opts.active
          ? "border-primary/35 bg-white text-[#b45a22]"
          : "border-[rgba(74,52,36,0.10)] bg-white/50 text-neutral-700 hover:bg-white/90",
      )}
    >
      <Icon size={18} weight="bold" className="size-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <CaretRightIcon
            size={14}
            weight="bold"
            className={cn("size-3.5 shrink-0 text-neutral-400 transition-transform duration-200", opts.expanded && "rotate-90")}
          />
        </>
      )}
    </button>
  );

  return (
    <div className={cn("flex flex-col gap-3", collapsed && "items-center")}>
      <div className={cn("flex items-center gap-3", collapsed ? "flex-col" : "")}>
        {!collapsed && (
          <span className="relative size-[52px] shrink-0 overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#c9a58a,#7d5c45)]">
            {property?.image ? (
              <Image src={property.image} alt="" fill sizes="52px" unoptimized className="object-cover" />
            ) : (
              <HouseLineIcon size={22} weight="bold" className="absolute inset-0 m-auto text-white/80" />
            )}
          </span>
        )}
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold leading-tight text-neutral-900">
              {property?.title.split(",")[0] ?? detail?.conversation.title ?? "Aucun projet"}
            </span>
            <span className="block truncate text-xs text-neutral-500">
              {property ? property.title.split(",").slice(1).join(",").trim() || property.place : "Sans bien"}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Déplier le panneau du projet" : "Replier le panneau du projet"}
          title={collapsed ? "Déplier" : "Replier"}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[rgba(74,52,36,0.10)] bg-white/65 text-neutral-600 transition-colors hover:bg-white"
        >
          <SidebarSimpleIcon size={18} weight="bold" className="size-[18px] shrink-0 -scale-x-100" />
        </button>
      </div>

      {/* Budget first (Salif, 2026-10-09): the price is what people check before acting.
          Two separate pots (2026-10-10): voices and images, and videos. */}
      {budget && !collapsed && (
        <div className="grid gap-3 rounded-[20px] border border-white/80 bg-white/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-neutral-600">Budget du mois</span>
            <button
              type="button"
              onClick={onCurrency}
              aria-label={currency === "FCFA" ? "Afficher en dollars" : "Afficher en FCFA"}
              className="inline-flex h-8 w-[5.25rem] shrink-0 cursor-pointer items-center justify-between rounded-lg border border-[rgba(74,52,36,0.10)] bg-white/80 px-2.5 text-[13px] font-semibold text-neutral-700"
            >
              <span className="tabular-nums">{currency === "FCFA" ? "FCFA" : "USD"}</span>
              <ArrowsLeftRightIcon size={14} weight="bold" className="size-3.5 shrink-0 text-neutral-400" />
            </button>
          </div>
          {[
            { key: "media", label: "Voix et images", hint: "Voix off, affiches, détourage, sous-titres", pot: budget },
            ...(budget.video ? [{ key: "video", label: "Vidéos", hint: "Vidéos et fins créées dans l'Éditeur", pot: budget.video }] : []),
          ].map(({ key, label, hint, pot }) => {
            const left = 1 - Math.min(1, pot.usedUsd / Math.max(pot.capUsd, 0.0001));
            return (
              <div key={key} className="grid gap-1" title={hint}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-neutral-500">{label}</span>
                  <span className="whitespace-nowrap text-[15px] font-bold tabular-nums text-neutral-900">{money(pot.remainingUsd)}</span>
                </div>
                <span className="h-1.5 overflow-hidden rounded-full bg-[rgba(74,52,36,0.10)]">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width] duration-500",
                      key === "video" ? "bg-[linear-gradient(90deg,#7aa7d6,#3f73ab)]" : "bg-[linear-gradient(90deg,#e09a62,#c96a2e)]",
                    )}
                    style={{ width: `${Math.max(2, left * 100)}%` }}
                  />
                </span>
                <span className="text-[11px] tabular-nums text-neutral-500">reste sur {money(pot.capUsd)}</span>
              </div>
            );
          })}
        </div>
      )}

      {!collapsed && canWrite && detail && (
        <button
          type="button"
          onClick={onSwitchProperty}
          className="inline-flex h-9 items-center gap-2 self-start whitespace-nowrap rounded-full border border-[rgba(74,52,36,0.10)] bg-white/55 px-3 text-[13px] font-semibold text-neutral-700 hover:bg-white"
        >
          <HouseLineIcon size={16} weight="bold" className="size-4 shrink-0" />
          {property ? "Changer de bien" : "Choisir un bien"}
        </button>
      )}

      <span className={cn("h-px bg-[rgba(74,52,36,0.10)]", collapsed ? "w-8" : "-mx-1")} />

      {action("pinned", "Résultats épinglés", PushPinIcon, () => {
        if (collapsed) onToggle();
        setOpen(open === "pinned" ? null : "pinned");
      }, { expandable: true, expanded: !collapsed && open === "pinned" })}
      <AnimatePresence initial={false}>
        {!collapsed && open === "pinned" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease }}
            className="-mt-1 overflow-hidden"
          >
            <div className="grid gap-1.5 px-1 pb-1">
              {pinned.length === 0 ? (
                <p className="px-2 py-1 text-xs text-neutral-500">Épinglez un script, une voix ou un visuel pour le retrouver ici.</p>
              ) : (
                pinned.map((a) => {
                  const Icon = KIND_ICON[a.kind];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onJump(a.id)}
                      title="Voir dans la conversation"
                      className="group flex min-w-0 cursor-pointer items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-left text-[13px] font-semibold text-neutral-800 transition-[background-color,box-shadow] hover:bg-white hover:shadow-[0_0_0_1px_rgba(201,106,46,0.30)] focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon size={14} weight="bold" className="size-3.5 shrink-0 text-neutral-500" />
                      <span className="min-w-0 flex-1 truncate">{pinnedLabel(a, scripts)}</span>
                      {a.kind === "voiceover" && typeof a.meta.duration_seconds === "number" && (
                        <span className="shrink-0 text-xs font-normal tabular-nums text-neutral-400">
                          {Math.floor(a.meta.duration_seconds / 60)}:{String(Math.round(a.meta.duration_seconds % 60)).padStart(2, "0")}
                        </span>
                      )}
                      <ArrowUpRightIcon size={14} weight="bold" className="size-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {action("voiceover", "Voix off", WaveformIcon, () => onView(view === "voiceover" ? "chat" : "voiceover"), { active: view === "voiceover" })}
      {action("editor", "Vidéo du bien", FilmSlateIcon, () => onView(view === "editor" ? "chat" : "editor"), { active: view === "editor" })}
      {action("visuals", "Créer un visuel", ImageSquareIcon, () => onView(view === "visuals" ? "chat" : "visuals"), { active: view === "visuals" })}
      {action("glossary", "Prononciation", TranslateIcon, () => onView(view === "glossary" ? "chat" : "glossary"), { active: view === "glossary" })}
      {cloningEnabled &&
        action("clone", "Cloner une voix", MicrophoneStageIcon, () => onView(view === "clone" ? "chat" : "clone"), { active: view === "clone" })}
    </div>
  );
}
