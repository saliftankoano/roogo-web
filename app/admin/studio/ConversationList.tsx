"use client";

import { ChatsIcon, PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { ConversationItem } from "./studio-types";

type Props = {
  conversations: ConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
};

function dayLabel(iso: string) {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return "Cette semaine";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Project history. Each row says who started the project and when, so a
 * teammate's work can be told apart from one's own at a glance.
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
}: Props) {
  const groups = new Map<string, ConversationItem[]>();
  for (const item of conversations) {
    const label = dayLabel(item.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  const others = conversations.some((item) => !item.isMine);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Projets</h2>
          <p className="text-xs text-neutral-500">
            {conversations.length} projet{conversations.length > 1 ? "s" : ""}
            {others ? ", les vôtres et ceux de l'équipe" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 active:scale-[0.985]"
        >
          <PlusIcon size={16} weight="bold" />
          Nouveau projet
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-5 text-center text-sm font-medium text-neutral-500">
          Vos projets apparaîtront ici.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {[...groups.entries()].map(([label, items]) => (
            <div key={label} className="space-y-1">
              <h3 className="px-2 text-xs font-bold uppercase tracking-widest text-neutral-500">
                {label}
              </h3>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-current={item.id === activeId}
                      className={cn(
                        "grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto]",
                        item.id === activeId
                          ? "bg-primary/10"
                          : "hover:bg-neutral-100",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          item.isMine ? "bg-primary/15 text-primary" : "bg-neutral-200 text-neutral-700",
                        )}
                        title={item.author ?? undefined}
                      >
                        {item.author ? initials(item.author) : <ChatsIcon size={16} weight="bold" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-neutral-900">{item.title}</span>
                          {!item.propertyId && (
                            <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                              Sans bien
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {item.isMine ? "Par vous" : `Par ${item.author ?? "un membre de l'équipe"}`}
                          {" · commencé le "}
                          {shortDate(item.createdAt)}
                        </span>
                      </span>
                      <span className="hidden text-right text-xs text-neutral-500 sm:block">
                        <span className="block">Modifié {shortDate(item.updatedAt)}</span>
                        <span className="block">{shortTime(item.updatedAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
