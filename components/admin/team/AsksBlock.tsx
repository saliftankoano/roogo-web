"use client";

// The dark "Demandes d’Ablassé" block (founder side) and the sender's view of
// their own asks. "Je m’en occupe" turns an ask into the founder's task;
// "Répondre" leaves a short reply the sender sees in their briefing.

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { DemandeView } from "@/lib/team-tasks/core";
import { SectionLabel, deName } from "./ui";

function senders(asks: DemandeView[]) {
  const names = [...new Set(asks.map((ask) => ask.fromName).filter(Boolean))] as string[];
  return names.length === 1 ? `Demandes ${deName(names[0])}` : "Demandes de l’équipe";
}

export function AsksBlock({
  asks,
  busy,
  readOnly = false,
  compact = false,
  onAccept,
  onReply,
}: {
  asks: DemandeView[];
  busy: Record<string, boolean>;
  readOnly?: boolean;
  compact?: boolean;
  onAccept: (ask: DemandeView) => void;
  onReply: (ask: DemandeView, text: string) => void;
}) {
  const pending = asks.filter((ask) => ask.state === "pending").length;
  return (
    <section
      aria-label={senders(asks)}
      className={cn("flex flex-col gap-2 bg-[#1F1A16] text-white", compact ? "rounded-[14px] p-2.5" : "rounded-2xl p-3 lg:rounded-[20px] lg:p-4")}
    >
      <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#E8A33D]">
        {senders(asks)} · {pending ? `${pending} en attente` : "traitées"}
      </span>
      {asks.map((ask) => (
        <AskCard key={ask.id} ask={ask} busy={!!busy[`ask:${ask.id}`]} readOnly={readOnly} compact={compact} onAccept={onAccept} onReply={onReply} />
      ))}
    </section>
  );
}

function AskCard({
  ask,
  busy,
  readOnly,
  compact,
  onAccept,
  onReply,
}: {
  ask: DemandeView;
  busy: boolean;
  readOnly: boolean;
  compact: boolean;
  onAccept: (ask: DemandeView) => void;
  onReply: (ask: DemandeView, text: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const id = useId();
  const from = ask.fromName ?? "l’équipe";
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl bg-white/[0.08]", compact ? "px-2.5 py-2" : "p-2.5")} data-ask={ask.id}>
      <span className="text-[11px] font-extrabold text-[#E8C9A0]">{ask.when}</span>
      <span className={cn("font-bold leading-snug [overflow-wrap:anywhere]", compact ? "text-[13px]" : "text-sm")}>{ask.title}</span>
      <span className="text-xs leading-snug text-[#D9CFC4] [overflow-wrap:anywhere]">{ask.reason}</span>
      {ask.state === "pending" && !readOnly && !replying && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAccept(ask)}
            className="h-11 cursor-pointer rounded-full bg-[#C96A2E] px-3.5 text-[13px] font-extrabold text-white disabled:opacity-60 lg:h-9 lg:px-3 lg:text-xs"
          >
            Je m’en occupe
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setReplying(true)}
            className="h-11 cursor-pointer rounded-full border border-white/30 bg-transparent px-3.5 text-[13px] font-bold text-white disabled:opacity-60 lg:h-9 lg:px-3 lg:text-xs"
          >
            Répondre
          </button>
        </div>
      )}
      {ask.state === "pending" && !readOnly && replying && (
        <form
          className="mt-1 flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) onReply(ask, text.trim());
          }}
        >
          <label htmlFor={id} className="text-xs font-bold text-[#E8C9A0]">Réponse à {from}</label>
          <textarea
            id={id}
            rows={2}
            maxLength={500}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="resize-y rounded-xl border border-white/20 bg-white/10 px-2.5 py-2 text-[13px] text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-[#C96A2E]"
            placeholder="Une réponse courte"
          />
          <div className="flex gap-1.5">
            <button type="submit" disabled={busy || !text.trim()} className="h-11 rounded-full bg-[#C96A2E] px-3.5 text-[13px] font-extrabold text-white disabled:opacity-60 lg:h-9">
              Envoyer
            </button>
            <button type="button" onClick={() => setReplying(false)} className="h-11 rounded-full border border-white/30 px-3.5 text-[13px] font-bold text-white lg:h-9">
              Annuler
            </button>
          </div>
        </form>
      )}
      {ask.state === "pending" && readOnly && <span className="text-xs font-bold text-[#E8C9A0]">En attente de réponse</span>}
      {(ask.state === "accepted" || ask.state === "done") && (
        <span className="text-xs font-extrabold text-[#9FD3AE]">
          {ask.state === "done" ? "Faite" : `Ajoutée aux tâches · ${from} est prévenu`}
        </span>
      )}
      {ask.state === "replied" && (
        <span className="text-xs font-bold text-[#E8C9A0]">Réponse à {from} : « {ask.replyText} »</span>
      )}
    </div>
  );
}

/** Directeur side: what happened to the asks they sent. */
export function MyAsksBlock({ asks }: { asks: DemandeView[] }) {
  const to = asks[0]?.toName ?? "Salif";
  return (
    <section aria-labelledby="mes-demandes" className="mt-1 flex flex-col gap-2">
      <SectionLabel>
        <span id="mes-demandes">Vos demandes à {to}</span>
      </SectionLabel>
      {asks.map((ask) => (
        <div key={ask.id} className="flex flex-col gap-1 rounded-[18px] border border-[#EAE1D5] bg-white px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-extrabold text-[#6B625B]">{ask.when}</span>
            <span
              className={cn(
                "inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-extrabold",
                ask.state === "pending" && "bg-[#FCEFD4] text-[#6E4300]",
                ask.state === "accepted" && "bg-[#E1EFF8] text-[#1F5F80]",
                ask.state === "replied" && "bg-[#EEEBE7] text-[#4A4540]",
                ask.state === "done" && "bg-[#E3F1E6] text-[#245C33]",
              )}
            >
              {{ pending: "En attente", accepted: `${ask.toName ?? "Salif"} s’en occupe`, replied: "Réponse reçue", done: "Faite" }[ask.state]}
            </span>
          </div>
          <span className="text-[15px] font-extrabold leading-snug [overflow-wrap:anywhere]">{ask.title}</span>
          {ask.state === "replied" && ask.replyText && (
            <span className="text-[13px] text-[#4A4540]">
              {ask.toName ?? "Salif"} : « {ask.replyText} »
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
