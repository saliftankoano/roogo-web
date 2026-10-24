"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type LinkedProperty = { id: string; title: string; place: string; price: string; reference: string | null };

/**
 * Optional link to a listing (PRD 2.9): type a code (VEN-023, LOC-7) or a
 * quartier. The listing's price and place are then inserted by code into
 * every text.
 */
export function PropertyLink({
  value,
  onChange,
  disabled,
}: {
  value: LinkedProperty | null;
  onChange: (next: LinkedProperty | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LinkedProperty[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/studio/properties?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { properties: LinkedProperty[] };
        if (!cancelled) {
          setItems(data.properties.slice(0, 6));
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
  }, [query, open]);

  if (value) {
    return (
      <div className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-[rgba(74,52,36,0.12)]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-[#1F1A16]">
            {value.reference ? <span className="mr-1.5 text-[#A8521D]">{value.reference}</span> : null}
            {value.title}
          </p>
          <p className="truncate text-[13px] text-neutral-600">{[value.place, value.price].filter(Boolean).join(" · ")}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label="Retirer le bien lié"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-[#F6F1EA] disabled:opacity-50"
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <MagnifyingGlassIcon size={18} weight="bold" className="pointer-events-none absolute left-3.5 top-[22px] -translate-y-1/2 text-neutral-500" />
      <input
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder="Code VEN-023, LOC-007 ou quartier"
        aria-label="Chercher le bien de la vidéo"
        className="h-11 w-full rounded-2xl border border-neutral-200 bg-white pl-10 pr-3 text-[15px] text-[#1F1A16] outline-none placeholder:text-neutral-400 focus:border-[#C96A2E] disabled:opacity-50"
      />
      {open && (
        <div className="mt-2 grid gap-1">
          {failed && <p className="text-[13px] text-red-700">Recherche impossible pour le moment.</p>}
          {items?.length === 0 && <p className="text-[13px] text-neutral-500">Aucun bien en ligne ne correspond.</p>}
          {items?.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p);
                setOpen(false);
                setQuery("");
              }}
              className={cn("flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[#F6F1EA]")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#1F1A16]">
                  {p.reference ? <span className="mr-1.5 text-[#A8521D]">{p.reference}</span> : null}
                  {p.title}
                </span>
                <span className="block truncate text-[12px] text-neutral-500">{[p.place, p.price].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="h-9 w-max px-1 text-[13px] font-semibold text-neutral-500 underline underline-offset-2">
            Pas de bien lié
          </button>
        </div>
      )}
    </div>
  );
}
