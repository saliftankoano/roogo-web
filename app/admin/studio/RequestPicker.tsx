"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlassIcon, MegaphoneIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { RequestForBrief } from "@/lib/studio/request-brief";

export type StudioRequest = RequestForBrief & { id: string; status: string };

type Props = {
  onPick: (request: StudioRequest) => void;
  disabled?: boolean;
};

const budgetOf = (r: StudioRequest) =>
  `${new Intl.NumberFormat("fr-FR").format(r.budget_max)} FCFA max`;

/** The open property requests (« demandes spécifiques »), newest first. */
export function RequestPicker({ onPick, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StudioRequest[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/property-requests");
        if (!res.ok) throw new Error(`requests ${res.status}`);
        const data = (await res.json()) as { requests: StudioRequest[] };
        if (!cancelled) setItems(data.requests.filter((r) => r.status !== "closed"));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = (items ?? []).filter(
    (r) =>
      !needle ||
      [r.title, r.city, r.neighborhood, r.property_type]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlassIcon
          size={18}
          weight="bold"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"
        />
        <input
          className="w-full rounded-2xl border border-neutral-200 bg-white py-3 pl-11 pr-4 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary"
          placeholder="Chercher une demande (quartier, type)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Chercher une demande"
        />
      </div>

      {failed && (
        <p className="text-sm font-bold text-red-600" role="alert">
          Les demandes n&apos;ont pas pu être chargées. Réessayez.
        </p>
      )}

      {items === null && !failed ? (
        <ul className="space-y-2" aria-busy="true" aria-label="Chargement des demandes">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-2">
              <span className="studio-skeleton size-16 shrink-0 rounded-xl" />
              <span className="grid min-w-0 flex-1 gap-2">
                <span className="studio-skeleton h-4 w-3/5 rounded-full" />
                <span className="studio-skeleton h-3 w-2/5 rounded-full" />
              </span>
            </li>
          ))}
        </ul>
      ) : items && shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm font-medium text-neutral-500">
          {items.length === 0
            ? "Aucune demande en cours. Ajoutez-en une dans Demandes de biens."
            : "Aucune demande ne correspond."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((request, index) => (
            <li
              key={request.id}
              className="animate-[studio-rise_0.32s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
              style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(request)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-2 text-left transition-colors hover:border-primary/40 active:scale-[0.99]",
                  disabled && "opacity-50",
                )}
              >
                <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <MegaphoneIcon size={26} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-neutral-900">{request.title}</span>
                  <span className="block truncate text-sm font-medium text-neutral-500">
                    {request.property_type} · {request.neighborhood ? `${request.neighborhood}, ` : ""}
                    {request.city}
                    {request.status === "draft" ? " · Brouillon" : ""}
                  </span>
                  <span className="block truncate text-sm font-bold text-primary">{budgetOf(request)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
