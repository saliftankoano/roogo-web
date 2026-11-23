"use client";

// « Notes d’appels » (NotesAppel.dc.html, Directeur view): every call noted by
// the team, newest first, filtered by Demandes / Propriétaires / Ventes.
// Directeur and Fondateur only (page and API check it).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { CallOutcome } from "@/lib/team-tasks/core";
import type { CallLogFilter, CallLogPayload, CallNoteView } from "@/lib/team-tasks/calls-server";
import type { CallResult } from "@/lib/team-tasks/prospects";
import type { ProspectHistory } from "@/lib/team-tasks/prospects-server";
import { CloseButton, Drawer } from "./Drawer";
import { CallHistory, FivePoints, StateChip, dueWords } from "./Prospect3DCall";
import { CreamBackdrop, callApi, useEntrance } from "./ui";

const FILTERS: [CallLogFilter, string, string | null][] = [
  ["tous", "Tous", null],
  ["visites3d", "Visites 3D", "visite_3d"],
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

const RESULT_TONE: Record<CallResult, string> = {
  oui: "bg-[#DDF0E2] text-[#245C33]",
  a_rappeler: "bg-[#FBEBC9] text-[#6E4300]",
  non: "bg-[#EEEBE7] text-[#4A4540]",
};

export function CallLog({ log, viewerName, viewerLevelLabel }: { log: CallLogPayload; viewerName: string; viewerLevelLabel: string }) {
  const [filter, setFilter] = useState<CallLogFilter>("tous");
  const [historyOf, setHistoryOf] = useState<string | null>(null);
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

      <div role="group" aria-label="Filtrer" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
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
      {filter === "visites3d" && !log.ready3d && log.ready && (
        <p className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] bg-white px-4 py-3 text-sm text-[#4A4540]" role="status">
          Le journal des appels 3D n’est pas encore installé (migration 111 à lancer).
        </p>
      )}
      {filter === "visites3d" && log.week3d && <WeekNumbers log={log} />}

      {log.ready && notes.length === 0 && (
        <p className="m-0 rounded-2xl bg-white px-4 py-6 text-center text-sm font-bold text-[#6B625B]">Aucun appel noté{kind ? " dans cette catégorie" : ""} pour l’instant.</p>
      )}

      <div className="flex flex-col gap-2">
        {notes.map((note) =>
          note.threeD ? (
            <ThreeDNote key={note.id} note={note} onOpen={() => setHistoryOf(note.threeD!.prospectId)} />
          ) : (
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
          ),
        )}
      </div>
      <HistoryDrawer prospectId={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

/** « Cette semaine » for Visites 3D: calls, oui, the objections and reactions that come back most (PRD 1.8). */
function WeekNumbers({ log }: { log: CallLogPayload }) {
  const week = log.week3d!;
  const seq = log.sequences;
  const max = Math.max(1, ...week.objections.map((o) => o.count));
  return (
    <section data-log aria-label="Visites 3D cette semaine" className="flex flex-col gap-4 rounded-[20px] bg-white px-4 py-4 lg:px-5">
      <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Cette semaine</span>
      <div className="grid grid-cols-3 gap-2">
        {[
          [week.calls, week.calls > 1 ? "appels" : "appel"],
          [week.answered, "joints"],
          [week.yes, "oui"],
        ].map(([n, label]) => (
          <span key={String(label)} className="flex flex-col">
            <span className="text-[28px] font-extrabold leading-none tabular-nums">{n}</span>
            <span className="text-xs font-bold text-[#6B625B]">{label}</span>
          </span>
        ))}
      </div>
      {week.objections.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-extrabold">Objections les plus fréquentes</span>
          {week.objections.slice(0, 3).map((o) => (
            <span key={o.key} className="flex items-center gap-2.5 text-[13px]">
              <span className="w-[150px] shrink-0 truncate font-bold lg:w-[190px]">{o.label}</span>
              <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-[#F0E8DD]">
                <span className="block h-full rounded-full bg-[#C96A2E]" style={{ width: `${(o.count / max) * 100}%` }} />
              </span>
              <span className="w-6 text-right font-extrabold tabular-nums">{o.count}</span>
            </span>
          ))}
        </div>
      )}
      {(week.problem.length > 0 || week.interests.length > 0) && (
        <div className="flex flex-col gap-1 text-[13px] text-[#4A4540]">
          {week.problem.length > 0 && (
            <span><span className="font-extrabold text-[#1F1A16]">Question du problème : </span>{week.problem.map((p) => `${p.label.toLowerCase()} ${p.count}`).join(", ")}</span>
          )}
          {week.interests.length > 0 && (
            <span><span className="font-extrabold text-[#1F1A16]">Ce qui intéresse : </span>{week.interests.map((p) => `${p.label.toLowerCase()} ${p.count}`).join(", ")}</span>
          )}
        </div>
      )}
      {seq && seq.enCours + seq.oui + seq.non + seq.aReprendre > 0 && (
        <span className="text-[13px] text-[#4A4540]">
          <span className="font-extrabold text-[#1F1A16]">Entreprises : </span>
          {seq.enCours} en cours, {seq.oui} oui, {seq.non} non, {seq.aReprendre} à reprendre plus tard
        </span>
      )}
    </section>
  );
}

function ThreeDNote({ note, onOpen }: { note: CallNoteView; onOpen: () => void }) {
  const d = note.threeD!;
  return (
    <article data-log className="flex flex-col gap-1.5 rounded-[18px] bg-white px-3.5 py-3 lg:px-4">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1F1A16] text-[10px] font-extrabold text-white">{note.authorInitials}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#6B625B]">
          {note.authorName} · {note.when} · contact {d.contactNumber}{d.channel === "whatsapp" ? " (WhatsApp)" : ""}
        </span>
        {d.result && <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-extrabold", RESULT_TONE[d.result])}>{d.resultLabel}</span>}
      </span>
      <button type="button" onClick={onOpen} className="cursor-pointer self-start border-0 bg-transparent p-0 text-left text-[15px] font-extrabold leading-tight underline-offset-2 hover:underline [overflow-wrap:anywhere]">
        {note.subject}
      </button>
      <span className="text-xs text-[#6B625B]">
        {d.kindLabel} · {d.noAnswer ? "pas de réponse" : `${d.answeredBy?.toLowerCase()} a répondu`}
      </span>
      <FivePoints call={d} />
      <span className="flex flex-wrap items-center gap-2">
        {d.state && <StateChip state={d.state}>{d.stateLabel}</StateChip>}
        <span className="flex-1" />
        <button type="button" onClick={onOpen} className="inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 text-xs font-extrabold text-[#8A4924] lg:min-h-0">
          Voir l’historique
        </button>
      </span>
    </article>
  );
}

function HistoryDrawer({ prospectId, onClose }: { prospectId: string | null; onClose: () => void }) {
  const [history, setHistory] = useState<ProspectHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!prospectId) return;
    let alive = true;
    setHistory(null);
    setError(null);
    callApi<{ history: ProspectHistory }>(`/api/admin/prospects?id=${prospectId}`)
      .then((body) => alive && setHistory(body.history))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "L’historique n’a pas pu se charger."));
    return () => {
      alive = false;
    };
  }, [prospectId]);
  if (!prospectId) return null;
  const p = history?.prospect;
  return (
    <Drawer
      open
      onClose={onClose}
      label="Historique de l’entreprise"
      width={480}
      header={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="flex-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">Visites 3D</span>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="m-0 text-xl font-extrabold leading-tight [overflow-wrap:anywhere]">{p?.name ?? (error ? "Entreprise" : "Chargement…")}</h2>
          {p && (
            <span className="flex flex-wrap items-center gap-2 text-sm text-[#6B625B]">
              {[p.kindLabel, p.place, p.phone].filter(Boolean).join(" · ")}
              <StateChip state={p.state}>{p.stateLabel}</StateChip>
            </span>
          )}
          {history?.openFollowUp && <span className="text-xs font-bold text-[#8A4924]">Prochaine étape : {history.openFollowUp.title}, {dueWords(history.openFollowUp.dueDate)}</span>}
        </div>
      }
    >
      <div className="p-4 lg:px-5">
        {error && <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">{error}</p>}
        {history && <CallHistory history={history} />}
      </div>
    </Drawer>
  );
}
