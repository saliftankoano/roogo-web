"use client";

// Starting a sheet from the briefing: pick the listing first, so the
// property, quartier, owner and type come from it (no retyping).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaretRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";

type Option = { id: string; label: string; sub: string };

export function FicheStartPicker() {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/team-tasks/links?type=property&q=${encodeURIComponent(q.trim())}`);
        const body = (await res.json().catch(() => ({}))) as { options?: Option[]; error?: string };
        if (mine !== seq.current) return;
        if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
        setOptions(body.options ?? []);
        setError(null);
      } catch (err) {
        if (mine === seq.current) setError(err instanceof Error ? err.message : "Recherche impossible.");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 text-[#1F1A16]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[#F6F1EA]" />
      <div className="flex flex-col gap-1">
        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924]">Fiche de visite</span>
        <h1 className="m-0 text-[28px] font-extrabold">Quel bien filmez-vous ?</h1>
        <p className="m-0 text-sm text-[#4A4540]">Le quartier, le propriétaire et le type viennent de l’annonce.</p>
      </div>
      <label className="flex h-12 items-center gap-2 rounded-full border border-[#E2D8CC] bg-white px-4 focus-within:border-[#C96A2E]">
        <MagnifyingGlassIcon size={18} weight="bold" className="text-[#6B625B]" aria-hidden="true" />
        <span className="sr-only">Chercher un bien</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Code (LOC-023), quartier ou ville"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          autoFocus
        />
      </label>
      {error && (
        <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
          {error}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-busy={options === null}>
        {options === null &&
          Array.from({ length: 4 }, (_, k) => <li key={k} aria-hidden="true" className="h-16 animate-pulse rounded-[18px] bg-white/70" />)}
        {options?.length === 0 && <li className="text-sm text-[#6B625B]">Aucun bien trouvé.</li>}
        {options?.map((o) => (
          <li key={o.id}>
            <Link
              href={`/admin/fiche-visite?bien=${o.id}`}
              className="flex min-h-16 items-center gap-3 rounded-[18px] border border-[#EAE1D5] bg-white px-4 py-3 text-[#1F1A16] no-underline transition-colors hover:border-[#C96A2E]"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-extrabold">{o.label}</span>
                <span className="text-xs text-[#6B625B]">{o.sub}</span>
              </span>
              <CaretRightIcon size={16} weight="bold" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
