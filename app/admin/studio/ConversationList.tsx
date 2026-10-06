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

  return (
    <div className="flex h-full flex-col gap-3">
      <button
        type="button"
        onClick={onNew}
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-white transition-all active:scale-[0.985]"
      >
        <PlusIcon size={18} weight="bold" />
        Nouvelle conversation
      </button>

      {conversations.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-5 text-center text-sm font-medium text-neutral-500">
          Vos conversations apparaîtront ici.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {[...groups.entries()].map(([label, items]) => (
            <div key={label} className="space-y-1">
              <h3 className="px-2 text-xs font-bold uppercase tracking-widest text-neutral-400">
                {label}
              </h3>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={item.id === activeId}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-bold transition-colors",
                    item.id === activeId
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-700 hover:bg-neutral-100",
                  )}
                >
                  <ChatsIcon size={16} weight="bold" className="shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.title}</span>
                    {item.author && (
                      <span className="block truncate text-xs font-medium opacity-60">
                        {item.author}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
