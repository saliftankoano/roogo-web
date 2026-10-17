"use client";

// The dark "Demandes d’Ablassé" block (founder side), the sender's view of
// their own asks, and the « Réponse de Salif » card. The founder answers a
// pending ask in four ways: « Je m’en occupe » (it becomes the founder's
// task, unchanged), « Oui, vas-y », « Pas maintenant » (back on a chosen day)
// and « Écrire une réponse » (a short thread either side closes with
// « Réglé »). The server checks who may do each of these.

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { nextMondayKey, type DemandeState, type DemandeView } from "@/lib/team-tasks/core";
import { SectionLabel, deName } from "./ui";

export type AskAction =
  | { action: "accept" }
  | { action: "approve" }
  | { action: "snooze"; until: string }
  | { action: "message"; text: string }
  | { action: "settle" }
  | { action: "seen" };

export type AskHandler = (ask: DemandeView, body: AskAction) => void;

function senders(asks: DemandeView[]) {
  const names = [...new Set(asks.map((ask) => ask.fromName).filter(Boolean))] as string[];
  return names.length === 1 ? `Demandes ${deName(names[0])}` : "Demandes de l’équipe";
}

function plusDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
function shortDay(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  return `${DAY[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function AsksBlock({
  asks,
  busy,
  todayKey,
  readOnly = false,
  compact = false,
  onAction,
}: {
  asks: DemandeView[];
  busy: Record<string, boolean>;
  todayKey: string;
  readOnly?: boolean;
  compact?: boolean;
  onAction: AskHandler;
}) {
  const open = asks.filter((ask) => ask.state === "pending" || ask.state === "thread").length;
  return (
    <section
      aria-label={senders(asks)}
      className={cn("flex flex-col gap-2 bg-[#1F1A16] text-white", compact ? "rounded-[14px] p-2.5" : "rounded-2xl p-3 lg:rounded-[20px] lg:p-4")}
    >
      <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#E8A33D]">
        {senders(asks)} · {open ? `${open} en attente` : "traitées"}
      </span>
      {asks.map((ask) => (
        <AskCard key={ask.id} ask={ask} busy={!!busy[`ask:${ask.id}`]} readOnly={readOnly} compact={compact} todayKey={todayKey} onAction={onAction} />
      ))}
    </section>
  );
}

type Mode = null | "snooze" | "write";

function AskCard({
  ask,
  busy,
  readOnly,
  compact,
  todayKey,
  onAction,
}: {
  ask: DemandeView;
  busy: boolean;
  readOnly: boolean;
  compact: boolean;
  todayKey: string;
  onAction: AskHandler;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [date, setDate] = useState(plusDays(todayKey, 1));
  const id = useId();
  const from = ask.fromName ?? "l’équipe";
  const open = ask.state === "pending" || ask.state === "thread";
  const monday = nextMondayKey(todayKey);
  const btn = "h-11 cursor-pointer rounded-full px-3.5 text-[13px] disabled:opacity-60 lg:h-9 lg:px-3 lg:text-xs";

  return (
    <div className={cn("flex flex-col gap-1 rounded-xl bg-white/[0.08]", compact ? "px-2.5 py-2" : "p-2.5")} data-ask={ask.id}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-extrabold text-[#E8C9A0]">{ask.when}</span>
        {ask.unread && !readOnly && (
          <span className="inline-flex h-5 items-center rounded-full bg-[#C96A2E] px-2 text-[10px] font-extrabold text-white">Nouveau message</span>
        )}
      </span>
      <span className={cn("font-bold leading-snug [overflow-wrap:anywhere]", compact ? "text-[13px]" : "text-sm")}>{ask.title}</span>
      <span className="text-xs leading-snug text-[#D9CFC4] [overflow-wrap:anywhere]">{ask.reason}</span>

      {ask.messages.length > 0 && (
        <ol className="m-0 mt-1 flex list-none flex-col gap-1.5 border-l-2 border-white/15 p-0 pl-2.5">
          {ask.messages.map((m) => (
            <li key={m.id} className="flex flex-col">
              <span className="text-[11px] font-extrabold text-[#E8C9A0]">{m.authorName} · {m.when}</span>
              <span className="whitespace-pre-wrap text-[13px] leading-snug [overflow-wrap:anywhere]">{m.body}</span>
            </li>
          ))}
        </ol>
      )}

      {open && !readOnly && mode === null && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button type="button" disabled={busy} onClick={() => onAction(ask, { action: "accept" })} className={cn(btn, "bg-[#C96A2E] font-extrabold text-white")}>
            Je m’en occupe
          </button>
          <button type="button" disabled={busy} onClick={() => onAction(ask, { action: "approve" })} className={cn(btn, "bg-white font-extrabold text-[#1F1A16]")}>
            Oui, vas-y
          </button>
          <button type="button" disabled={busy} onClick={() => setMode("snooze")} className={cn(btn, "border border-white/30 bg-transparent font-bold text-white")}>
            Pas maintenant
          </button>
          <button type="button" disabled={busy} onClick={() => setMode("write")} className={cn(btn, "border border-white/30 bg-transparent font-bold text-white")}>
            {ask.state === "thread" ? "Répondre" : "Écrire une réponse"}
          </button>
          {ask.state === "thread" && (
            <button type="button" disabled={busy} onClick={() => onAction(ask, { action: "settle" })} className={cn(btn, "bg-transparent font-bold text-[#9FD3AE]")}>
              Réglé
            </button>
          )}
          {ask.unread && (
            <button type="button" disabled={busy} onClick={() => onAction(ask, { action: "seen" })} className={cn(btn, "bg-transparent font-bold text-[#E8C9A0]")}>
              Marquer comme lu
            </button>
          )}
        </div>
      )}

      {open && !readOnly && mode === "snooze" && (
        <div className="mt-1 flex flex-col gap-1.5">
          <span className="text-xs font-bold text-[#E8C9A0]">Quand la demande revient-elle ?</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(ask, { action: "snooze", until: monday })}
              className={cn(btn, "bg-white font-extrabold text-[#1F1A16]")}
            >
              Lundi prochain ({shortDay(monday)})
            </button>
            <label htmlFor={`${id}-d`} className="sr-only">Une date</label>
            <input
              id={`${id}-d`}
              type="date"
              min={plusDays(todayKey, 1)}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-11 rounded-xl border border-white/20 bg-white/10 px-2.5 text-[13px] text-white [color-scheme:dark] lg:h-9"
            />
            <button type="button" disabled={busy || !date} onClick={() => onAction(ask, { action: "snooze", until: date })} className={cn(btn, "bg-[#C96A2E] font-extrabold text-white")}>
              Ce jour-là
            </button>
            <button type="button" onClick={() => setMode(null)} className={cn(btn, "border border-white/30 font-bold text-white")}>
              Annuler
            </button>
          </div>
          <span className="text-[11px] text-[#D9CFC4]">Elle disparaît d’ici et revient en attente ce jour-là. {from} est prévenu.</span>
        </div>
      )}

      {open && !readOnly && mode === "write" && (
        <form
          className="mt-1 flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            onAction(ask, { action: "message", text: text.trim() });
            setText("");
            setMode(null);
          }}
        >
          <label htmlFor={`${id}-t`} className="text-xs font-bold text-[#E8C9A0]">Réponse à {from}</label>
          <textarea
            id={`${id}-t`}
            rows={2}
            maxLength={1000}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="resize-y rounded-xl border border-white/20 bg-white/10 px-2.5 py-2 text-[13px] text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-[#C96A2E]"
            placeholder={`${from} pourra vous répondre ici`}
          />
          <div className="flex gap-1.5">
            <button type="submit" disabled={busy || !text.trim()} className={cn(btn, "bg-[#C96A2E] font-extrabold text-white")}>
              Envoyer
            </button>
            <button type="button" onClick={() => setMode(null)} className={cn(btn, "border border-white/30 font-bold text-white")}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {open && readOnly && <span className="text-xs font-bold text-[#E8C9A0]">{ask.state === "thread" ? "Discussion en cours" : "En attente de réponse"}</span>}
      <ClosedLine ask={ask} from={from} />
    </div>
  );
}

function ClosedLine({ ask, from }: { ask: DemandeView; from: string }) {
  const line: Partial<Record<DemandeState, string>> = {
    accepted: `Ajoutée aux tâches · ${from} est prévenu`,
    done: "Faite",
    approved: `Oui, vas-y · ${from} est prévenu`,
    snoozed: `${ask.snoozedUntil ?? "Mise de côté"} · ${from} est prévenu`,
    settled: `Réglée${ask.settledByName ? ` par ${ask.settledByName}` : ""}`,
  };
  if (ask.state === "replied") {
    return <span className="text-xs font-bold text-[#E8C9A0]">Réponse à {from} : « {ask.replyText} »</span>;
  }
  const text = line[ask.state];
  if (!text) return null;
  return <span className={cn("text-xs font-extrabold", ask.state === "snoozed" ? "text-[#E8C9A0]" : "text-[#9FD3AE]")}>{text}</span>;
}

const STATE_LABEL = (to: string): Record<DemandeState, string> => ({
  pending: "En attente",
  snoozed: "Pas maintenant",
  accepted: `${to} s’en occupe`,
  approved: "Oui, vas-y",
  thread: "Discussion",
  settled: "Réglée",
  replied: "Réponse reçue",
  done: "Faite",
});

const STATE_TONE: Record<DemandeState, string> = {
  pending: "bg-[#FCEFD4] text-[#6E4300]",
  snoozed: "bg-[#EEEBE7] text-[#4A4540]",
  accepted: "bg-[#E1EFF8] text-[#1F5F80]",
  approved: "bg-[#E3F1E6] text-[#245C33]",
  thread: "bg-[#F7E4D3] text-[#8A4924]",
  settled: "bg-[#E3F1E6] text-[#245C33]",
  replied: "bg-[#EEEBE7] text-[#4A4540]",
  done: "bg-[#E3F1E6] text-[#245C33]",
};

/** What the founder answered, in one line, for the sender. */
export function answerLine(ask: DemandeView): string {
  const to = ask.toName ?? "Salif";
  switch (ask.state) {
    case "approved":
      return `Oui, vas-y : ${to} vous dit d’avancer.`;
    case "snoozed":
      return `Pas maintenant. ${ask.snoozedUntil ?? ""}`.trim();
    case "accepted":
      return `${to} s’en occupe.`;
    case "done":
      return `${to} l’a faite.`;
    case "settled":
      return `Réglée${ask.settledByName ? ` par ${ask.settledByName}` : ""}.`;
    case "replied":
      return `« ${ask.replyText ?? ""} »`;
    default: {
      const last = ask.messages[ask.messages.length - 1];
      return last ? `${last.authorName} : « ${last.body} »` : "Nouvelle réponse.";
    }
  }
}

/** « Réponse de Salif »: new answers on the asks the viewer sent, until opened. */
export function ReplyCards({ asks, busy, onOpen }: { asks: DemandeView[]; busy: Record<string, boolean>; onOpen: (ask: DemandeView) => void }) {
  const unread = asks.filter((ask) => ask.unread);
  if (!unread.length) return null;
  return (
    <section aria-label="Réponses à vos demandes" className="flex flex-col gap-2">
      {unread.map((ask) => (
        <div key={ask.id} data-anim className="flex flex-col gap-1.5 rounded-[18px] bg-white p-3.5 shadow-[0_0_0_2px_#C96A2E,0_14px_30px_-18px_rgba(31,26,22,0.5)] lg:rounded-[20px] lg:p-4">
          <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">Réponse de {ask.toName ?? "Salif"}</span>
          <span className="text-base font-extrabold leading-snug [overflow-wrap:anywhere]">{ask.title}</span>
          <span className="text-sm leading-snug text-[#4A4540] [overflow-wrap:anywhere]">{answerLine(ask)}</span>
          <button
            type="button"
            disabled={busy[`ask:${ask.id}`]}
            onClick={() => onOpen(ask)}
            className="mt-1 h-11 self-start cursor-pointer rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white disabled:opacity-60"
          >
            Ouvrir
          </button>
        </div>
      ))}
    </section>
  );
}

/** Directeur side: what happened to the asks they sent, with the thread when there is one. */
export function MyAsksBlock({ asks, busy, onAction }: { asks: DemandeView[]; busy: Record<string, boolean>; onAction: AskHandler }) {
  const to = asks[0]?.toName ?? "Salif";
  return (
    <section aria-labelledby="mes-demandes" className="mt-1 flex flex-col gap-2">
      <SectionLabel>
        <span id="mes-demandes">Vos demandes à {to}</span>
      </SectionLabel>
      {asks.map((ask) => (
        <MyAsk key={ask.id} ask={ask} busy={!!busy[`ask:${ask.id}`]} onAction={onAction} />
      ))}
    </section>
  );
}

function MyAsk({ ask, busy, onAction }: { ask: DemandeView; busy: boolean; onAction: AskHandler }) {
  const [text, setText] = useState("");
  const id = useId();
  const to = ask.toName ?? "Salif";
  return (
    <div id={`demande-${ask.id}`} className={cn("flex flex-col gap-1.5 rounded-[18px] border bg-white px-3.5 py-3", ask.unread ? "border-[#C96A2E]" : "border-[#EAE1D5]")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-extrabold text-[#6B625B]">{ask.when}</span>
        <span className={cn("inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-extrabold", STATE_TONE[ask.state])}>{STATE_LABEL(to)[ask.state]}</span>
        {ask.unread && <span className="inline-flex h-[22px] items-center rounded-full bg-[#C96A2E] px-2 text-[11px] font-extrabold text-white">Nouveau</span>}
      </div>
      <span className="text-[15px] font-extrabold leading-snug [overflow-wrap:anywhere]">{ask.title}</span>
      {ask.state !== "thread" && ask.state !== "pending" && <span className="text-[13px] text-[#4A4540]">{answerLine(ask)}</span>}
      {ask.messages.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-1.5 border-l-2 border-[#EFE6DA] p-0 pl-2.5">
          {ask.messages.map((m) => (
            <li key={m.id} className="flex flex-col">
              <span className="text-[11px] font-extrabold text-[#6B625B]">{m.authorName} · {m.when}</span>
              <span className="whitespace-pre-wrap text-[13px] leading-snug text-[#1F1A16] [overflow-wrap:anywhere]">{m.body}</span>
            </li>
          ))}
        </ol>
      )}
      {ask.state === "thread" && (
        <form
          className="mt-1 flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            onAction(ask, { action: "message", text: text.trim() });
            setText("");
          }}
        >
          <label htmlFor={`${id}-t`} className="sr-only">Répondre à {to}</label>
          <textarea
            id={`${id}-t`}
            rows={2}
            maxLength={1000}
            value={text}
            onFocus={() => ask.unread && onAction(ask, { action: "seen" })}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Répondre à ${to}`}
            className="resize-y rounded-xl border border-[#E2D8CC] bg-[#FBF7F1] px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E]"
          />
          <div className="flex flex-wrap gap-1.5">
            <button type="submit" disabled={busy || !text.trim()} className="h-11 rounded-full bg-[#C96A2E] px-4 text-[13px] font-extrabold text-white disabled:opacity-60 lg:h-9">
              Envoyer
            </button>
            <button type="button" disabled={busy} onClick={() => onAction(ask, { action: "settle" })} className="h-11 rounded-full border border-[#E2D8CC] bg-white px-4 text-[13px] font-bold lg:h-9">
              Réglé
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
