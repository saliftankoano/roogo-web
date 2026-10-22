"use client";

// « Appeler et noter » (Bureau.dc.html call drawer on desktop, NotesAppel.dc.html
// on the phone). Call the client, choose the result, write the notes, say
// what comes next. Saving creates the next step's task and closes the call
// task. A call task cannot be ticked before this (server rule).

import { useEffect, useId, useState } from "react";
import { LockSimpleIcon, MicrophoneIcon, PhoneIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES, type CallNextStep, type CallOutcome } from "@/lib/team-tasks/core";
import type { CallContext } from "@/lib/team-tasks/calls-server";
import { TimeSelect24h } from "@/components/ui/TimeSelect24h";
import { CloseButton, Drawer } from "./Drawer";
import { announceTasksChanged, callApi } from "./ui";

function dayWord(key: string, todayKey: string) {
  const diff = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
  if (diff === 0) return "aujourd’hui";
  if (diff === 1) return "demain";
  const d = new Date(`${key}T00:00:00Z`);
  return `le ${["dim", "lun", "mar", "mer", "jeu", "ven", "sam"][d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function CallPanel({ taskId, onClose, onSaved }: { taskId: string | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [call, setCall] = useState<CallContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [next, setNext] = useState<CallNextStep | null>(null);
  const [notes, setNotes] = useState("");
  const [recallDate, setRecallDate] = useState("");
  const [recallTime, setRecallTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    setCall(null);
    setLoadError(null);
    setOutcome(null);
    setNext(null);
    setNotes("");
    setError(null);
    callApi<{ call: CallContext }>(`/api/admin/call-notes?taskId=${taskId}`)
      .then((body) => {
        if (!alive) return;
        setCall(body.call);
        setRecallDate(body.call.recallDefault.date);
        setRecallTime(body.call.recallDefault.time);
      })
      .catch((err) => alive && setLoadError(err instanceof Error ? err.message : "L’appel n’a pas pu se charger."));
    return () => {
      alive = false;
    };
  }, [taskId]);

  if (!taskId) return null;

  const recallLabel = call ? `Rappeler ${dayWord(recallDate || call.recallDefault.date, call.todayKey)} ${recallTime}` : "Rappeler";
  const nexts: { step: CallNextStep; label: string; hint: string }[] = [
    { step: "visite", label: "Proposer une visite", hint: "Une tâche « Visite à confirmer » est créée pour vous." },
    { step: "rappel", label: recallLabel, hint: `Une tâche d’appel « Rappeler » arrive dans votre briefing ${call ? dayWord(recallDate, call.todayKey) : ""} à ${recallTime}.` },
    ...(call?.passLabel ? [{ step: "passer_au_directeur" as CallNextStep, label: call.passLabel, hint: call.passHint ?? "" }] : []),
    { step: "rien", label: "Rien à faire, fermer la tâche", hint: "La tâche est fermée. Les notes restent dans les appels précédents." },
  ];
  const hint = nexts.find((n) => n.step === next)?.hint ?? "Choisissez la suite.";

  async function save() {
    if (!call || !outcome || !next) {
      setError(!outcome ? "Choisissez le résultat de l’appel." : "Dites ce qui se passe ensuite.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await callApi("/api/admin/call-notes", {
        method: "POST",
        body: JSON.stringify({ taskId: call.taskId, outcome, notes, nextStep: next, nextDate: recallDate, nextTime: recallTime }),
      });
      announceTasksChanged();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "L’enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  }

  const chip = (on: boolean) =>
    cn(
      "min-h-11 cursor-pointer rounded-[14px] px-3.5 text-sm font-extrabold lg:min-h-10 lg:rounded-full lg:text-[13px]",
      on ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white text-[#1F1A16]",
    );

  return (
    <Drawer
      open
      onClose={onClose}
      label="Notes de l’appel"
      width={480}
      z={75}
      header={
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">{call?.eyebrow ?? "Appel"}</span>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="m-0 text-xl font-extrabold leading-tight lg:text-[22px]">{call?.subject ?? (loadError ? "Appel" : "Chargement…")}</h2>
          {call?.sub && <span className="text-sm text-[#6B625B] [overflow-wrap:anywhere]">{call.sub}</span>}
          {call?.phone ? (
            <a
              href={`tel:${call.phone.replace(/[\s.-]/g, "")}`}
              data-autofocus
              className="inline-flex h-14 items-center justify-center gap-2.5 rounded-[18px] bg-[#2F7A48] px-4 text-base font-extrabold text-white no-underline hover:bg-[#245C33] lg:h-11 lg:self-start lg:rounded-full lg:text-sm"
            >
              <PhoneIcon size={18} weight="bold" aria-hidden="true" />
              Appeler le client · {call.phone}
            </a>
          ) : call ? (
            <span className="text-[13px] font-bold text-[#6E4300]">Aucun numéro enregistré pour cet appel.</span>
          ) : null}
          {call && <span className="text-xs text-[#6B625B] lg:hidden">Revenez ici après l’appel : la page reste ouverte.</span>}
        </div>
      }
      footer={
        <div className="flex flex-col gap-2">
          {error && <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving || !call || call.done}
            className="h-[52px] w-full cursor-pointer rounded-full bg-[#C96A2E] text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {call?.done ? "Appel déjà noté" : saving ? "Enregistrement…" : "Enregistrer les notes"}
          </button>
          <span className="flex items-center gap-2 text-xs text-[#6B625B]">
            <LockSimpleIcon size={14} aria-hidden="true" />
            Visible par vous, le Directeur et le Fondateur.
          </span>
        </div>
      }
    >
      {loadError && (
        <p role="alert" className="m-4 rounded-2xl bg-[#FBE3DF] px-3 py-2.5 text-sm font-semibold text-[#8E2A1E]">{loadError}</p>
      )}
      {call && (
        <div className="flex flex-col gap-4 bg-[#F6F1EA] p-4 lg:bg-white lg:px-5">
          <fieldset className="m-0 flex flex-col gap-2 rounded-[20px] border-0 bg-white p-3.5 lg:p-0">
            <legend className="mb-2 p-0 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Résultat de l’appel</legend>
            <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
              {CALL_OUTCOMES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={outcome === value}
                  onClick={() => {
                    setOutcome(value);
                    setNext(value === "joint" ? "visite" : "rappel");
                  }}
                  className={chip(outcome === value)}
                >
                  {CALL_OUTCOME_LABELS[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2 rounded-[20px] bg-white p-3.5 lg:p-0">
            <label htmlFor={`${id}-notes`} className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Notes</label>
            <textarea
              id={`${id}-notes`}
              rows={5}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="resize-y rounded-[14px] border border-[#E2D8CC] bg-[#FBF7F1] p-3 text-[15px] leading-[1.45] outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E]"
            />
            <span className="flex items-center gap-1.5 text-xs text-[#6B625B]">
              <MicrophoneIcon size={14} aria-hidden="true" className="lg:hidden" />
              <span className="lg:hidden">Dictez avec le micro du clavier si c’est plus rapide.</span>
              <span className="hidden lg:inline">Ce qu’il a dit, ce qu’il veut, ce qui bloque. Écrivez pendant l’appel ou juste après.</span>
            </span>
          </div>

          <fieldset className="m-0 flex flex-col gap-2 rounded-[20px] border-0 bg-white p-3.5 lg:p-0">
            <legend className="mb-2 p-0 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Et ensuite ?</legend>
            <div className="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap lg:gap-2">
              {nexts.map((n) => (
                <button
                  key={n.step}
                  type="button"
                  aria-pressed={next === n.step}
                  onClick={() => setNext(n.step)}
                  className={cn(
                    "min-h-11 cursor-pointer rounded-[14px] px-3.5 text-left text-sm font-extrabold lg:min-h-10 lg:rounded-full lg:text-[13px]",
                    next === n.step ? "bg-[#FDF6EF] text-[#8A4924] shadow-[inset_0_0_0_2px_#C96A2E]" : "border border-[#E2D8CC] bg-white text-[#1F1A16]",
                  )}
                >
                  {n.label}
                </button>
              ))}
            </div>
            {next === "rappel" && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`${id}-rd`} className="text-[13px] text-[#6B625B]">Le</label>
                <input
                  id={`${id}-rd`}
                  type="date"
                  min={call.todayKey}
                  value={recallDate}
                  onChange={(event) => setRecallDate(event.target.value)}
                  className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-[15px]"
                />
                <label htmlFor={`${id}-rt`} className="text-[13px] text-[#6B625B]">à</label>
                <TimeSelect24h id={`${id}-rt`} label="Rappeler à" value={recallTime} onChange={setRecallTime} />
              </div>
            )}
            <span className="text-xs text-[#6B625B]" aria-live="polite">{hint}</span>
          </fieldset>

          <div className="flex flex-col gap-2.5 rounded-2xl border border-[#EFE6DA] bg-[#FBF7F1] px-3.5 py-3">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Appels précédents sur ce sujet</span>
            {call.previous.length === 0 && <span className="text-[13px] text-[#6B625B]">Aucun appel noté pour l’instant.</span>}
            {call.previous.map((note) => (
              <div key={note.id} className="flex flex-col gap-0.5">
                <span className="text-[13px] font-extrabold">
                  {note.when} · {note.authorName} · {note.outcomeLabel}
                </span>
                {note.notes && <span className="whitespace-pre-wrap text-[13px] leading-snug text-[#4A4540]">{note.notes}</span>}
                <span className="text-xs font-bold text-[#8A4924]">Suite : {note.next}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}
