"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChatsCircleIcon,
  ImageSquareIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { avatarTone, initials } from "./studio-ui";
import type { ConversationItem } from "./studio-types";

type Kind = ConversationItem["kind"];
type Filter = "all" | Kind;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "chat", label: "Chats" },
  { key: "visual", label: "Visuels" },
  { key: "video", label: "Vidéos" },
];

const KIND_BADGE: Record<Kind, { label: string; className: string }> = {
  chat: { label: "Chat", className: "bg-primary/12 text-[#b45a22]" },
  visual: { label: "Visuel", className: "bg-[rgba(63,166,217,0.15)] text-[#1f6f97]" },
  video: { label: "Vidéo", className: "bg-[rgba(91,58,122,0.12)] text-[#5b3a7a]" },
};

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return "Cette semaine";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function stamp(iso: string) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function firstName(name: string | null) {
  return name?.split(/\s+/)[0] ?? "Équipe";
}

/**
 * The single, shared history (decision of 2026-10-09): conversations, visuals
 * and videos from the whole team, newest first, with who made each one.
 */
export function HistoryPanel({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onNewVisual,
  collapsed = false,
  onToggle,
}: {
  conversations: ConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onNewVisual: () => void;
  /** Folded to a slim rail: recent projects as initials. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(
      (item) =>
        (filter === "all" || item.kind === filter || item.contains.includes(filter)) &&
        (!q ||
          item.title.toLowerCase().includes(q) ||
          (item.author ?? "").toLowerCase().includes(q) ||
          (item.summary ?? "").toLowerCase().includes(q)),
    );
  }, [conversations, filter, query]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Déplier l'historique"
          title="Historique"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[rgba(74,52,36,0.10)] bg-white/65 text-neutral-600 transition-colors hover:bg-white"
        >
          <SidebarSimpleIcon size={18} weight="bold" className="size-[18px] shrink-0" />
        </button>
        <button
          type="button"
          onClick={onNewChat}
          aria-label="Nouvelle conversation"
          title="Nouvelle conversation"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#d77a3c,#b45a22)] text-white shadow-[0_10px_24px_-12px_rgba(180,90,34,0.8)] active:scale-95"
        >
          <PlusIcon size={18} weight="bold" className="size-[18px] shrink-0" />
        </button>
        <span className="h-px w-8 bg-[rgba(74,52,36,0.10)]" />
        {conversations.slice(0, 8).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={item.id === activeId}
            aria-label={`${item.title}, ${item.isMine ? "vous" : firstName(item.author)}`}
            title={`${item.title} (${item.isMine ? "vous" : firstName(item.author)})`}
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-shadow",
              avatarTone(item.author),
              item.id === activeId && "shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(201,106,46,0.6)]",
            )}
          >
            {initials(item.author)}
          </button>
        ))}
      </div>
    );
  }

  const groups = new Map<string, ConversationItem[]>();
  for (const item of visible) {
    const label = dayLabel(item.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex items-center gap-2 px-1">
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Replier l'historique"
            title="Replier"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-white/70"
          >
            <SidebarSimpleIcon size={18} weight="bold" className="size-[18px] shrink-0" />
          </button>
        )}
        <h2 className="min-w-0 truncate text-xl font-bold tracking-tight text-neutral-900">Historique</h2>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          className="ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[linear-gradient(135deg,#d77a3c,#b45a22)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(180,90,34,0.8)] active:scale-[0.97]"
        >
          <PlusIcon size={16} weight="bold" className="size-4 shrink-0" />
          Nouveau
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl"
            >
              {[
                { label: "Conversation", hint: "Script et voix d'un bien", icon: ChatsCircleIcon, run: onNewChat },
                { label: "Visuel", hint: "Affiche, voeux, annonce", icon: ImageSquareIcon, run: onNewVisual },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    option.run();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-neutral-100"
                >
                  <option.icon size={18} weight="bold" className="size-[18px] shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold text-neutral-900">{option.label}</span>
                    <span className="block text-xs text-neutral-500">{option.hint}</span>
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <label className="flex h-11 items-center gap-2.5 rounded-full border border-[rgba(74,52,36,0.10)] bg-white/65 px-4 focus-within:border-primary/50">
        <MagnifyingGlassIcon size={18} weight="bold" className="size-[18px] shrink-0 text-neutral-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher"
          aria-label="Rechercher dans l'historique"
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
        />
      </label>

      {/* One row on every width; scrolls sideways on a phone (allowed exception). */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold transition-colors",
              filter === f.key
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-[rgba(74,52,36,0.10)] bg-white/45 text-neutral-700 hover:bg-white/80",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[rgba(74,52,36,0.18)] p-5 text-center text-sm text-neutral-500">
          {query
            ? "Rien ne correspond à cette recherche."
            : filter === "video"
              ? "Les vidéos créées depuis l'éditeur apparaîtront ici."
              : filter === "visual"
                ? "Aucun visuel pour l'instant. Créez-en un avec Nouveau."
                : filter === "chat"
                  ? "Aucune conversation pour l'instant. Commencez-en une avec Nouveau."
                  : "Les projets de l'équipe apparaîtront ici."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {[...groups.entries()].map(([label, items]) => (
            <section key={label} className="flex flex-col gap-2">
              <span className="self-center rounded-full border border-white/80 bg-white/75 px-3 py-0.5 text-xs font-semibold text-neutral-600">
                {label}
              </span>
              {items.map((item) => {
                const badge = KIND_BADGE[item.kind];
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active}
                    className={cn(
                      "grid w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-3 rounded-[18px] border p-3 text-left transition-[background-color,transform,box-shadow,border-color] duration-150",
                      active
                        ? "border-primary/35 bg-white/95 shadow-[0_10px_24px_-16px_rgba(90,50,26,0.5)]"
                        : "border-transparent bg-white/40 hover:-translate-y-px hover:bg-white/75",
                    )}
                  >
                    <span
                      className={cn("flex size-10 items-center justify-center rounded-full text-xs font-bold", avatarTone(item.author))}
                      title={item.author ?? undefined}
                    >
                      {initials(item.author)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold text-neutral-900">{item.title}</span>
                        <span className="shrink-0 text-xs tabular-nums text-neutral-400">{stamp(item.updatedAt)}</span>
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-500">
                        <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold", badge.className)}>
                          {badge.label}
                        </span>
                        <span className="min-w-0 truncate">
                          {item.isMine ? "Vous" : firstName(item.author)}
                          {item.summary ? ` · ${item.summary}` : ""}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

