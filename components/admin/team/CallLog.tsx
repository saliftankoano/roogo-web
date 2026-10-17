"use client";

// « Notes d’appels » (NotesAppel.dc.html, Directeur view): every call noted by
// the team, newest first, filtered by Demandes / Propriétaires / Ventes.
// Directeur and Fondateur only (page and API check it).

import Link from "next/link";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { CallOutcome } from "@/lib/team-tasks/core";
import type { CallLogFilter, CallLogPayload } from "@/lib/team-tasks/calls-server";
import { CreamBackdrop, useEntrance } from "./ui";

const FILTERS: [CallLogFilter, string, string | null][] = [
  ["tous", "Tous", null],
  ["demandes", "Demandes", "demande"],
  ["proprietaires", "Propriétaires", "proprietaire"],
  ["ventes", "Ventes", "vente"],
];

const OUTCOME_TONE: Record<CallOutcome, string> = {
  joint: "bg-[#DDF0E2] text-[#245C33]",
  pas_de_reponse: "bg-[#FBEBC9] text-[#6E4300]",
  messagerie: "bg-[#FBEBC9] text-[#6E4300]",
  mauvais_numero: "bg-[#FBE3DF] text-[#8E2A1E]",
};

export function CallLog({ log, viewerName, viewerLevelLabel }: { log: CallLogPayload; viewerName: string; viewerLevelLabel: string }) {
  const [filter, setFilter] = useState<CallLogFilter>("tous");
  const rootRef = useRef<HTMLDivElement>(null);
  useEntrance(rootRef, "[data-log]", [filter]);
  const kind = FILTERS.find(([f]) => f === filter)?.[2] ?? null;
  const notes = log.notes.filter((note) => !kind || note.subjectKind === kind);

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-[880px] flex-col gap-3 pb-16 text-[#1F1A16] lg:gap-4">
      <CreamBackdrop />
      <header className="flex flex-col gap-1">
        <Link href="/admin/equipe" className="mb-1 inline-flex min-h-11 items-center self-start text-sm font-extrabold text-[#8A4924] no-underline hover:text-[#5A321A] lg:min-h-0">
          ‹ L’équipe
        </Link>
        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924]">{viewerName} · {viewerLevelLabel}</span>
        <h1 className="m-0 text-[26px] font-extrabold lg:text-[30px]">Notes d’appels</h1>
        <span className="text-[13px] text-[#6B625B] lg:text-sm">Tous les appels notés par l’équipe, les plus récents d’abord. Visibles par la personne qui a appelé, le Directeur et le Fondateur.</span>
      </header>

      <div role="group" aria-label="Filtrer" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-extrabold lg:h-9",
              filter === value ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white text-[#1F1A16]",
            )}
          >
            {label}
            <span className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px]", filter === value ? "bg-white/20" : "bg-[#F0E8DD] text-[#6B625B]")}>
              {log.counts[value]}
            </span>
          </button>
        ))}
      </div>

      {!log.ready && (
        <p className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] bg-white px-4 py-3 text-sm text-[#4A4540]" role="status">
          Les notes d’appel ne sont pas encore installées (migration 092 à lancer).
        </p>
      )}
      {log.ready && notes.length === 0 && (
        <p className="m-0 rounded-2xl bg-white px-4 py-6 text-center text-sm font-bold text-[#6B625B]">Aucun appel noté{kind ? " dans cette catégorie" : ""} pour l’instant.</p>
      )}

      <div className="flex flex-col gap-2">
        {notes.map((note) => (
          <article key={note.id} data-log className="flex flex-col gap-1.5 rounded-[18px] bg-white px-3.5 py-3 lg:px-4">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1F1A16] text-[10px] font-extrabold text-white">{note.authorInitials}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#6B625B]">{note.authorName} · {note.when}</span>
              <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-extrabold", OUTCOME_TONE[note.outcome])}>{note.outcomeLabel}</span>
            </span>
            <span className="text-[15px] font-extrabold leading-tight [overflow-wrap:anywhere]">{note.subject}</span>
            {note.notes && <span className="whitespace-pre-wrap text-[13px] leading-[1.45] text-[#4A4540] [overflow-wrap:anywhere]">{note.notes}</span>}
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-[#8A4924]">Suite : {note.next}</span>
              <span className="flex-1" />
              {note.href && note.link && (
                <Link href={note.href} className="inline-flex min-h-11 items-center text-xs font-extrabold text-[#8A4924] lg:min-h-0">
                  {note.link}
                </Link>
              )}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}
