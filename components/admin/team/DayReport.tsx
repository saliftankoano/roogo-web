"use client";

// « Fin de journée » on Mon espace (approved 2026-10-19): a card that opens at
// 15:00 Ouagadougou and is highlighted from 17:30 (the in-app reminder), and
// the form behind it. Four parts and an absence switch, about two minutes:
// what I did, my actions for tomorrow (each one becomes a task), what did not
// work today, how we could do better.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MoonStarsIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  ABSENCE_CATEGORIES,
  ABSENCE_LABELS,
  EOD_OPENS_AT,
  IMPROVEMENT_HINT,
  LIMITS,
  MEDICAL_HINT,
  PRIVATE_NOTE_HINT,
  WENT_WRONG_HINT,
  eodWindow,
  type AbsenceCategory,
} from "@/lib/team-tasks/day-reports";
import type { MyDayReportPayload } from "@/lib/team-tasks/day-reports-server";
import { CloseButton, Drawer } from "./Drawer";
import { DoneTick, SectionLabel, announceTasksChanged, callApi } from "./ui";

/** Server time plus the time spent on the page, so the card turns on at 15:00 and 17:30 without a reload. */
function useServerClock(nowIso: string) {
  const [offset] = useState(() => new Date(nowIso).getTime() - Date.now());
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date(Date.now() + offset)), 30_000);
    return () => window.clearInterval(id);
  }, [offset]);
  return now;
}

export function EndOfDayCard({ initial, onSaved }: { initial: MyDayReportPayload; onSaved?: () => void }) {
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(false);
  const now = useServerClock(initial.nowIso);
  const phase = eodWindow(now);
  const report = data.report;

  const refresh = useCallback(async () => {
    try {
      const body = await callApi<{ report: MyDayReportPayload }>("/api/admin/day-reports");
      setData(body.report);
    } catch {
      // The card keeps what it had; the form shows its own errors.
    }
  }, []);

  if (!data.ready) {
    return (
      <p className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] bg-white px-4 py-3 text-sm text-[#4A4540]" role="status">
        Le compte rendu de fin de journée n’est pas encore installé (migration 099 à lancer).
      </p>
    );
  }

  if (phase === "closed" && !report) {
    return (
      <section aria-label="Fin de journée" className="flex items-center gap-3 rounded-[20px] border border-[#EAE1D5] bg-white px-4 py-3">
        <MoonStarsIcon size={20} weight="bold" className="shrink-0 text-[#B8AC9F]" aria-hidden="true" />
        <span className="text-sm text-[#6B625B]">
          <span className="font-extrabold text-[#1F1A16]">Fin de journée</span> · le compte rendu s’ouvre à {EOD_OPENS_AT}.
        </span>
      </section>
    );
  }

  const due = phase === "due" && !report;
  const sent = !!report?.submittedAt && !report.absent;
  const absent = !!report?.absent;

  return (
    <>
      <section
        data-anim
        aria-labelledby="fin-de-journee"
        className={cn(
          "flex flex-col gap-2.5 rounded-[20px] p-4",
          due && "bg-[#FFF4EA] shadow-[0_0_0_2px_#C96A2E,0_14px_30px_-18px_rgba(201,106,46,0.7)]",
          !due && !report && "border border-[#EAE1D5] bg-white",
          sent && "border border-[#CFE6D5] bg-[#F1F8F3]",
          absent && "border border-[#E2D8CC] bg-[#F4EEE6]",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <MoonStarsIcon size={20} weight="bold" aria-hidden="true" className={cn("shrink-0", due ? "text-[#C96A2E]" : sent ? "text-[#2F7A48]" : "text-[#8A4924]")} />
          <h2 id="fin-de-journee" className="m-0 flex-1 text-base font-extrabold lg:text-lg">Fin de journée</h2>
          {due && (
            <span className="inline-flex h-6 items-center rounded-full bg-[#C96A2E] px-2.5 text-xs font-extrabold text-white">C’est l’heure</span>
          )}
          {sent && <span className="inline-flex h-6 items-center rounded-full bg-[#E3F1E6] px-2.5 text-xs font-extrabold text-[#245C33]">Envoyé à {report!.submittedTime}</span>}
          {absent && report!.absenceCategory && (
            <span className="inline-flex h-6 items-center rounded-full bg-[#EEEBE7] px-2.5 text-xs font-extrabold text-[#4A4540]">
              Absent(e) · {ABSENCE_LABELS[report!.absenceCategory].toLowerCase()}
            </span>
          )}
        </div>
        <p className="m-0 text-sm leading-snug text-[#4A4540]">
          {sent
            ? `Merci. ${actionCount(report!.tomorrowActions.length)} dans « Demain ». Modifiable jusqu’à minuit.`
            : absent
              ? report!.declaredForThem && report!.declaredByName
                ? `Absence déclarée par ${report!.declaredByName}. Vous pouvez la modifier aujourd’hui.`
                : "Absence enregistrée. Vous pouvez la modifier aujourd’hui."
              : due
                ? "Deux minutes : ce que vous avez fait, vos actions pour demain, et ce qu’on peut améliorer."
                : "Ce que vous avez fait, vos actions pour demain, et ce qu’on peut améliorer. Deux minutes."}
        </p>
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={phase === "closed"}
            className={cn(
              "inline-flex h-12 cursor-pointer items-center rounded-full px-5 text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-60 lg:h-11 lg:text-sm",
              report ? "border border-[#E2D8CC] bg-white text-[#1F1A16]" : "bg-[#C96A2E] text-white hover:bg-[#8A4924]",
            )}
          >
            {report ? "Modifier mon compte rendu" : "Remplir mon compte rendu"}
          </button>
        </div>
      </section>
      <EndOfDayForm
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        onSaved={async () => {
          setOpen(false);
          announceTasksChanged();
          await refresh();
          onSaved?.();
        }}
      />
    </>
  );
}

function actionCount(n: number) {
  return n > 1 ? `${n} actions ajoutées` : n === 1 ? "1 action ajoutée" : "Aucune action ajoutée";
}

function initialActions(data: MyDayReportPayload) {
  const list = data.report?.tomorrowActions ?? [];
  return list.length ? [...list] : [""];
}

export function EndOfDayForm({
  open,
  onClose,
  data,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  data: MyDayReportPayload;
  onSaved: () => void;
}) {
  const id = useId();
  const report = data.report;
  const [doneExtra, setDoneExtra] = useState(report?.doneExtra ?? "");
  const [actions, setActions] = useState<string[]>(initialActions(data));
  const [wentWrong, setWentWrong] = useState(report?.wentWrong ?? "");
  const [improvement, setImprovement] = useState(report?.improvement ?? "");
  const [absent, setAbsent] = useState(report?.absent ?? false);
  const [category, setCategory] = useState<AbsenceCategory | null>(report?.absenceCategory ?? null);
  const [note, setNote] = useState(report?.absenceNote ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusLast = useRef(false);

  useEffect(() => {
    if (!open) return;
    setDoneExtra(report?.doneExtra ?? "");
    setActions(initialActions(data));
    setWentWrong(report?.wentWrong ?? "");
    setImprovement(report?.improvement ?? "");
    setAbsent(report?.absent ?? false);
    setCategory(report?.absenceCategory ?? null);
    setNote(report?.absenceNote ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    actionRefs.current[actions.length - 1]?.focus();
  }, [actions.length]);

  const filled = useMemo(() => actions.map((a) => a.trim()).filter(Boolean), [actions]);
  const noteHidden = !!report?.absenceNoteHidden;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (absent && !category) {
      setError("Choisissez la raison de l’absence.");
      return;
    }
    if (!absent && filled.length === 0) {
      setError("Écrivez au moins une action pour demain.");
      actionRefs.current[0]?.focus();
      return;
    }
    setSending(true);
    try {
      await callApi("/api/admin/day-reports", {
        method: "POST",
        body: JSON.stringify({
          doneExtra: doneExtra.trim() || null,
          tomorrowActions: filled,
          wentWrong: wentWrong.trim() || null,
          improvement: improvement.trim() || null,
          absent,
          absenceCategory: absent ? category : null,
          // A note the person cannot read (declared by the Directeur) is kept by the server when left empty.
          absenceNote: absent ? note.trim() || null : null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "L’envoi a échoué.");
    } finally {
      setSending(false);
    }
  }

  const textarea = "w-full resize-y rounded-2xl border border-[#E2D8CC] bg-white px-3 py-2.5 text-[15px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E]";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      label="Mon compte rendu de fin de journée"
      width={520}
      header={
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924]">{data.todayLabel}</span>
            <h2 className="m-0 text-xl font-extrabold">Mon compte rendu</h2>
            <span className="text-[13px] text-[#6B625B]">Environ deux minutes. Une seule fois par jour, modifiable jusqu’à minuit.</span>
          </div>
          <CloseButton onClose={onClose} />
        </div>
      }
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-3.5 py-2.5 text-sm font-semibold text-[#8E2A1E]">
              {error}
            </p>
          )}
          <button
            type="submit"
            form={`${id}-form`}
            disabled={sending}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-[#C96A2E] px-5 text-[15px] font-extrabold text-white hover:bg-[#8A4924] disabled:cursor-wait disabled:opacity-60"
          >
            {sending ? "Envoi…" : "Envoyer mon compte rendu"}
          </button>
        </div>
      }
    >
      <form id={`${id}-form`} onSubmit={submit} className="flex flex-col gap-6 px-4 py-4 lg:px-5">
        {/* 1. Fait aujourd'hui */}
        <section data-drawer-row aria-labelledby={`${id}-fait`} className="flex flex-col gap-2">
          <SectionLabel as="h3"><span id={`${id}-fait`}>1. Fait aujourd’hui</span></SectionLabel>
          {data.doneToday.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 rounded-2xl bg-[#FBF7F1] p-3">
              {data.doneToday.map((title, index) => (
                <li key={index} className="flex items-start gap-2 text-sm leading-snug text-[#1F1A16]">
                  <DoneTick />
                  <span className="[overflow-wrap:anywhere]">{title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 rounded-2xl bg-[#FBF7F1] px-3 py-2.5 text-sm text-[#6B625B]">Aucune tâche cochée aujourd’hui.</p>
          )}
          <label htmlFor={`${id}-extra`} className="mt-1 text-[13px] font-extrabold">
            Autre travail fait <span className="font-semibold text-[#6B625B]">(facultatif)</span>
          </label>
          <textarea
            id={`${id}-extra`}
            data-autofocus
            rows={2}
            maxLength={LIMITS.doneExtra}
            value={doneExtra}
            onChange={(e) => setDoneExtra(e.target.value)}
            placeholder="Ce qui n’était pas dans vos tâches"
            className={textarea}
          />
        </section>

        {/* 2. Mes actions pour demain */}
        <section data-drawer-row aria-labelledby={`${id}-demain`} className="flex flex-col gap-2">
          <SectionLabel as="h3"><span id={`${id}-demain`}>2. Mes actions pour demain</span></SectionLabel>
          <p className="m-0 text-[13px] leading-snug text-[#6B625B]">
            Une ligne par action, de 1 à 5. Chacune devient une tâche pour {data.tomorrowLabel.toLowerCase()} dans votre briefing.
          </p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {actions.map((value, index) => (
              <li key={index} className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#F7E4D3] text-xs font-extrabold text-[#8A4924]">
                  {index + 1}
                </span>
                <label htmlFor={`${id}-action-${index}`} className="sr-only">Action {index + 1} pour demain</label>
                <input
                  id={`${id}-action-${index}`}
                  ref={(el) => {
                    actionRefs.current[index] = el;
                  }}
                  value={value}
                  maxLength={LIMITS.action}
                  onChange={(e) => setActions((list) => list.map((a, i) => (i === index ? e.target.value : a)))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (actions.length < LIMITS.actionsMax && value.trim()) {
                        focusLast.current = true;
                        setActions((list) => [...list, ""]);
                      }
                    }
                  }}
                  placeholder={index === 0 ? "Ex. Rappeler le propriétaire de Balkuy" : "Une autre action"}
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-[#E2D8CC] bg-white px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E]"
                />
                {actions.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Retirer l’action ${index + 1}`}
                    onClick={() => setActions((list) => list.filter((_, i) => i !== index))}
                    className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8E2A1E] hover:bg-[#FBE3DF]"
                  >
                    <TrashIcon size={18} weight="bold" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {actions.length < LIMITS.actionsMax && (
            <button
              type="button"
              onClick={() => {
                focusLast.current = true;
                setActions((list) => [...list, ""]);
              }}
              className="inline-flex h-11 cursor-pointer items-center gap-1.5 self-start rounded-full border border-dashed border-[#D6CBBE] bg-white px-4 text-sm font-bold text-[#1F1A16]"
            >
              <PlusIcon size={16} weight="bold" aria-hidden="true" />
              Ajouter une action
            </button>
          )}
        </section>

        {/* 3. Ce qui n'a pas marché */}
        <section data-drawer-row className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-wrong`} className="m-0 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">
            3. Ce qui n’a pas marché aujourd’hui
          </label>
          <span id={`${id}-wrong-hint`} className="text-[13px] text-[#6B625B]">{WENT_WRONG_HINT}</span>
          <textarea
            id={`${id}-wrong`}
            aria-describedby={`${id}-wrong-hint`}
            rows={2}
            maxLength={LIMITS.wentWrong}
            value={wentWrong}
            onChange={(e) => setWentWrong(e.target.value)}
            className={textarea}
          />
        </section>

        {/* 4. Comment faire mieux */}
        <section data-drawer-row className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-better`} className="m-0 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">
            4. Comment on pourrait faire mieux
          </label>
          <span id={`${id}-better-hint`} className="text-[13px] text-[#6B625B]">{IMPROVEMENT_HINT}</span>
          <textarea
            id={`${id}-better`}
            aria-describedby={`${id}-better-hint`}
            rows={2}
            maxLength={LIMITS.improvement}
            value={improvement}
            onChange={(e) => setImprovement(e.target.value)}
            className={textarea}
          />
        </section>

        {/* Absence */}
        <section data-drawer-row className="flex flex-col gap-3 rounded-2xl border border-[#EAE1D5] bg-[#FBF7F1] p-3.5">
          <div className="flex items-center gap-3">
            <span id={`${id}-absent`} className="flex-1 text-[15px] font-extrabold">J’étais absent(e) aujourd’hui</span>
            <button
              type="button"
              role="switch"
              aria-checked={absent}
              aria-labelledby={`${id}-absent`}
              onClick={() => setAbsent((v) => !v)}
              className="-m-1.5 inline-flex h-11 w-[64px] shrink-0 cursor-pointer items-center justify-center"
            >
              <span className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition-colors", absent ? "bg-[#C96A2E]" : "bg-[#D6CBBE]")}>
                <span className={cn("absolute size-5 rounded-full bg-white shadow transition-transform", absent ? "translate-x-6" : "translate-x-1")} />
              </span>
            </button>
          </div>
          {absent && (
            <>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-2 p-0 text-[13px] font-extrabold">Raison</legend>
                <div role="radiogroup" className="grid grid-cols-2 gap-2">
                  {ABSENCE_CATEGORIES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={category === value}
                      onClick={() => setCategory(value)}
                      className={cn(
                        "min-h-11 cursor-pointer rounded-2xl px-3 text-sm font-bold",
                        category === value ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white text-[#1F1A16]",
                      )}
                    >
                      {ABSENCE_LABELS[value]}
                    </button>
                  ))}
                </div>
              </fieldset>
              {report?.declaredForThem && report.declaredByName && (
                <p className="m-0 text-[13px] text-[#4A4540]">Déclarée par {report.declaredByName}.</p>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-note`} className="text-[13px] font-extrabold">
                  Note <span className="font-semibold text-[#6B625B]">(facultatif)</span>
                </label>
                <span id={`${id}-note-hint`} className="text-[13px] text-[#6B625B]">
                  {PRIVATE_NOTE_HINT} {MEDICAL_HINT}
                </span>
                <textarea
                  id={`${id}-note`}
                  aria-describedby={`${id}-note-hint`}
                  rows={2}
                  maxLength={LIMITS.note}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={noteHidden ? "Une note du Directeur existe déjà, elle sera gardée." : undefined}
                  className={textarea}
                />
              </div>
            </>
          )}
        </section>
      </form>
    </Drawer>
  );
}
