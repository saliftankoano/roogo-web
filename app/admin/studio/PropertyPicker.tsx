"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { HouseLineIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { PropertySummary } from "./studio-types";

type Props = {
  onPick: (property: PropertySummary) => void;
  disabled?: boolean;
};

export function PropertyPicker({ onPick, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PropertySummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Search as the person types; an empty search lists the newest live listings.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/studio/properties?q=${encodeURIComponent(query)}`,
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { properties: PropertySummary[] };
        if (!cancelled) {
          setItems(data.properties);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, query ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlassIcon
          size={18}
          weight="bold"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400"
        />
        <input
          className="w-full rounded-2xl border border-neutral-200 bg-white py-3 pl-11 pr-4 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary"
          placeholder="Chercher un bien (quartier, type)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Chercher un bien"
        />
      </div>

      {failed && (
        <p className="text-sm font-bold text-red-600" role="alert">
          La recherche a échoué. Réessayez.
        </p>
      )}

      {items === null && !failed ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : items && items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm font-medium text-neutral-500">
          Aucun bien en ligne ne correspond.
        </p>
      ) : (
        <ul className="space-y-2">
          {items?.map((property) => (
            <li key={property.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(property)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-2 text-left transition-colors hover:border-primary/40 active:scale-[0.99]",
                  disabled && "opacity-50",
                )}
              >
                <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                  {property.image ? (
                    <Image
                      src={property.image}
                      alt=""
                      fill
                      sizes="64px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <HouseLineIcon
                      size={24}
                      className="absolute inset-0 m-auto text-neutral-300"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-neutral-900">
                    {property.title}
                  </span>
                  <span className="block truncate text-sm font-medium text-neutral-500">
                    {property.place}
                  </span>
                  <span className="block truncate text-sm font-bold text-primary">
                    {property.price}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
