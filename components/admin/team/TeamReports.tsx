"use client";

// « Fin de journée » on L'équipe (Directeur and Fondateur): today's status
// chip in each column, the report behind it, « Déclarer une absence », and the
// week's summary with everyone's improvement ideas in one place.

import { useEffect, useId, useState } from "react";
import { LightbulbIcon, MoonStarsIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/team-tasks/core";
import {
  ABSENCE_CATEGORIES,
  ABSENCE_LABELS,
  LIMITS,
  MEDICAL_HINT,
  PRIVATE_NOTE_HINT,
  absenceCountLabel,
  type AbsenceCategory,
  type ReportChip,
} from "@/lib/team-tasks/day-reports";
import type { TeamDayReports, TeamReportPerson } from "@/lib/team-tasks/day-reports-server";
import { CloseButton, Drawer } from "./Drawer";
import { Avatar, DoneTick, SectionLabel, callApi } from "./ui";

const CHIP_TONES: Record<ReportChip["tone"], string> = {
  green: "bg-[#E3F1E6] text-[#245C33]",
  amber: "bg-[#FCEFD4] text-[#6E4300]",
  grey: "bg-[#EEEBE7] text-[#4A4540]",
};

/** Today's status of one person; opens their report. */
export function ReportChipButton({ person, onOpen }: { person: TeamReportPerson; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${person.chip.label}, voir le compte rendu de ${person.firstName}`}
      className={cn(
        "inline-flex min-h-8 cursor-pointer items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-extrabold max-lg:min-h-11",
        CHIP_TONES[person.chip.tone],
      )}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", person.chip.tone === "green" ? "bg-[#2F7A48]" : person.chip.tone === "amber" ? "bg-[#E8A33D]" : "bg-[#8A8178]")} />
      {person.chip.label}
    </button>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section data-drawer-row className="flex flex-col gap-1.5">
      <SectionLabel as="h3">{title}</SectionLabel>
      {children}
    </section>
  );
}

function Text({ value, empty }: { value: string | null; empty: string }) {
  return value ? (
    <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed text-[#1F1A16] [overflow-wrap:anywhere]">{value}</p>
  ) : (
    <p className="m-0 text-sm text-[#8A8178]">{empty}</p>
  );
}

/** The report of one person today, as the viewer may see it (the server already removed what they may not read). */
export function ReportDrawer({
  person,
  todayLabel,
  onClose,
  onClear,
  busy,
}: {
  person: TeamReportPerson | null;
  todayLabel: string;
  onClose: () => void;
  onClear: (person: TeamReportPerson) => void;
  busy: boolean;
}) {
  const report = person?.today ?? null;
  return (
    <Drawer
      open={!!person}
      onClose={onClose}
      label={person ? `Compte rendu de ${person.firstName}` : "Compte rendu"}
      width={500}
      header={
        person && (
          <div className="flex items-start gap-3">
            <Avatar initials={person.initials} tone={person.isMe ? "brand" : "ink"} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924]">{todayLabel}</span>
              <h2 className="m-0 text-xl font-extrabold">{person.firstName}</h2>
              <span className={cn("inline-flex h-6 items-center self-start rounded-full px-2.5 text-xs font-extrabold", CHIP_TONES[person.chip.tone])}>
                {person.chip.label}
                {report?.submittedTime && !report.absent ? ` à ${report.submittedTime}` : ""}
              </span>
            </div>
            <CloseButton onClose={onClose} />
          </div>
        )
      }
    >
      {person && (
        <div className="flex flex-col gap-5 px-4 py-4 lg:px-5">
          {report?.absent && (
            <section data-drawer-row className="flex flex-col gap-1.5 rounded-2xl bg-[#F4EEE6] p-3.5">
              <span className="text-[15px] font-extrabold">
                Absent(e) · {report.absenceCategory ? ABSENCE_LABELS[report.absenceCategory] : "Autre"}
              </span>
              {report.declaredByName && (
                <span className="text-[13px] text-[#4A4540]">
                  {report.declaredForThem ? `Déclarée par ${report.declaredByName}` : "Déclarée par la personne elle-même"}
                </span>
              )}
              {report.absenceNote ? (
                <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-[#1F1A16]">{report.absenceNote}</p>
              ) : (
                <span className="text-[13px] text-[#8A8178]">Pas de note.</span>
              )}
              <span className="text-xs text-[#6B625B]">Note visible seulement par le Directeur et le Fondateur.</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onClear(person)}
                className="mt-1 inline-flex h-11 cursor-pointer items-center self-start rounded-full border border-[#E8B9B0] bg-white px-4 text-[13px] font-bold text-[#8E2A1E] disabled:cursor-wait disabled:opacity-60 lg:h-9"
              >
                Retirer l’absence
              </button>
            </section>
          )}
          {!report?.submittedAt ? (
            <p data-drawer-row className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] px-4 py-3 text-sm text-[#4A4540]">
              {report?.absent ? "Pas de compte rendu ce jour-là." : `${person.firstName} n’a pas encore envoyé son compte rendu. Il s’ouvre à 15:00.`}
            </p>
          ) : (
            <>
              <Block title="1. Fait aujourd’hui">
                {report.doneItems.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {report.doneItems.map((title, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm leading-snug">
                        <DoneTick />
                        <span className="[overflow-wrap:anywhere]">{title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-sm text-[#8A8178]">Aucune tâche cochée.</p>
                )}
                {report.doneExtra && <Text value={report.doneExtra} empty="" />}
              </Block>
              <Block title="2. Actions pour demain">
                {report.tomorrowActions.length ? (
                  <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[15px] leading-snug marker:font-extrabold marker:text-[#8A4924]">
                    {report.tomorrowActions.map((title, index) => (
                      <li key={index} className="[overflow-wrap:anywhere]">{title}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="m-0 text-sm text-[#8A8178]">Aucune action.</p>
                )}
              </Block>
              <Block title="3. Ce qui n’a pas marché">
                <Text value={report.wentWrong} empty="Rien de noté." />
              </Block>
              <Block title="4. Comment faire mieux">
                <Text value={report.improvement} empty="Pas d’idée notée." />
              </Block>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}

type DayChoice = "today" | "yesterday" | "other";

/** « Déclarer une absence »: a Directeur or the Fondateur records someone's absence (who declared it is saved). */
export function DeclareAbsenceDrawer({
  open,
  onClose,
  team,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamDayReports;
  onSaved: (message: string) => void;
}) {
  const id = useId();
  const [personId, setPersonId] = useState<string | null>(null);
  const [day, setDay] = useState<DayChoice>("today");
  const [otherDate, setOtherDate] = useState(team.todayKey);
  const [category, setCategory] = useState<AbsenceCategory | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPersonId(null);
    setDay("today");
    setOtherDate(team.todayKey);
    setCategory(null);
    setNote("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const date = day === "today" ? team.todayKey : day === "yesterday" ? addDays(team.todayKey, -1) : otherDate;
  const person = team.declarable.find((p) => p.id === personId) ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!person) return setError("Choisissez la personne absente.");
    if (!category) return setError("Choisissez la raison de l’absence.");
    setSending(true);
    try {
      await callApi("/api/admin/day-reports/absences", {
        method: "POST",
        body: JSON.stringify({ userId: person.id, date, category, note: note.trim() || null }),
      });
      onSaved(`Absence de ${person.firstName} enregistrée.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L’enregistrement a échoué.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      label="Déclarer une absence"
      width={480}
      header={
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924]">L’équipe</span>
            <h2 className="m-0 text-xl font-extrabold">Déclarer une absence</h2>
            <span className="text-[13px] text-[#6B625B]">Quand quelqu’un vous prévient par téléphone. Votre nom est enregistré avec l’absence.</span>
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
            disabled={sending || !team.ready}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-[#C96A2E] px-5 text-[15px] font-extrabold text-white hover:bg-[#8A4924] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Enregistrement…" : person ? `Enregistrer l’absence de ${person.firstName}` : "Enregistrer l’absence"}
          </button>
        </div>
      }
    >
      <form id={`${id}-form`} onSubmit={submit} className="flex flex-col gap-5 px-4 py-4 lg:px-5">
        {!team.ready && (
          <p className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] bg-white px-4 py-3 text-sm text-[#4A4540]" role="status">
            Pas encore possible : migration 099 à lancer.
          </p>
        )}
        <fieldset data-drawer-row className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-extrabold">Qui</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
            {team.declarable.map((p) => {
              const on = p.id === personId;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPersonId(p.id)}
                  className={cn(
                    "flex min-h-[92px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2",
                    on ? "bg-[#FFF4EA] shadow-[0_0_0_2px_#C96A2E]" : "border border-[#E2D8CC] bg-white",
                  )}
                >
                  <Avatar initials={p.initials} tone={on ? "brand" : "ink"} size={36} />
                  <span className="max-w-full truncate text-sm font-extrabold">{p.isMe ? "Moi" : p.firstName}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset data-drawer-row className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-extrabold">Quel jour</legend>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["today", "Aujourd’hui"],
              ["yesterday", "Hier"],
              ["other", "Autre date…"],
            ] as [DayChoice, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={day === value}
                onClick={() => setDay(value)}
                className={cn(
                  "h-11 cursor-pointer rounded-full px-4 text-sm font-bold",
                  day === value ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white text-[#1F1A16]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {day === "other" && (
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-date`} className="text-[13px] text-[#6B625B]">Le</label>
              <input
                id={`${id}-date`}
                type="date"
                min={addDays(team.todayKey, -14)}
                max={addDays(team.todayKey, 31)}
                value={otherDate}
                onChange={(e) => setOtherDate(e.target.value)}
                className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-[15px]"
              />
            </div>
          )}
        </fieldset>

        <fieldset data-drawer-row className="m-0 flex flex-col gap-2 border-0 p-0">
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

        <div data-drawer-row className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-[13px] font-extrabold">
            Note <span className="font-semibold text-[#6B625B]">(facultatif)</span>
          </label>
          <span id={`${id}-note-hint`} className="text-[13px] text-[#6B625B]">{PRIVATE_NOTE_HINT} {MEDICAL_HINT}</span>
          <textarea
            id={`${id}-note`}
            aria-describedby={`${id}-note-hint`}
            rows={2}
            maxLength={LIMITS.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. Prévenu par téléphone à 8 h, revient demain"
            className="w-full resize-y rounded-2xl border border-[#E2D8CC] bg-white px-3 py-2.5 text-[15px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E]"
          />
        </div>
      </form>
    </Drawer>
  );
}

/** « Comptes rendus de la semaine »: x/5 per person, absences by category, and the week's improvement ideas. */
export function WeekReportsSummary({ team, onOpen }: { team: TeamDayReports; onOpen: (person: TeamReportPerson) => void }) {
  const totals = ABSENCE_CATEGORIES.filter((c) => team.absencesByCategory[c] > 0);
  return (
    <section aria-labelledby="comptes-rendus-semaine" className="flex flex-col gap-3 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <SectionLabel>
          <span id="comptes-rendus-semaine">Comptes rendus de la semaine</span>
        </SectionLabel>
        <span className="text-xs text-[#6B625B]">{team.weekLabel}, envoyés du lundi au vendredi</span>
      </div>
      {!team.ready && (
        <p className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] px-4 py-3 text-sm text-[#4A4540]" role="status">
          Le compte rendu de fin de journée n’est pas encore installé (migration 099 à lancer).
        </p>
      )}
      {team.ready && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            {team.people.map((person) => {
              const pct = Math.round((person.week.sent / person.week.expected) * 100);
              const absences = ABSENCE_CATEGORIES.filter((c) => (person.week.absences[c] ?? 0) > 0);
              return (
                <button
                  key={person.personId}
                  type="button"
                  onClick={() => onOpen(person)}
                  className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-1 text-left hover:bg-[#FBF7F1]"
                >
                  <span className="w-24 shrink-0 truncate text-sm font-extrabold">{person.firstName}</span>
                  <span aria-hidden="true" className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-[#F0E8DD]">
                    <span className={cn("block h-full rounded-full", pct >= 100 ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} style={{ width: `${person.week.sent ? Math.max(pct, 6) : 0}%` }} />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-extrabold">
                    {person.week.sent}/{person.week.expected}
                  </span>
                  {absences.length > 0 && (
                    <span className="flex basis-full flex-wrap gap-1 pl-[108px] max-sm:pl-0">
                      {absences.map((c) => (
                        <span key={c} className="inline-flex h-6 items-center rounded-full bg-[#EEEBE7] px-2 text-[11px] font-extrabold text-[#4A4540]">
                          {absenceCountLabel(c, person.week.absences[c] ?? 0)}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-[#F0E8DD] pt-3">
              <span className="text-[13px] font-extrabold">Absences de l’équipe :</span>
              {totals.length === 0 ? (
                <span className="text-[13px] text-[#6B625B]">aucune</span>
              ) : (
                totals.map((c) => (
                  <span key={c} className="inline-flex h-7 items-center rounded-full bg-[#F4EEE6] px-2.5 text-xs font-extrabold text-[#1F1A16]">
                    {absenceCountLabel(c, team.absencesByCategory[c])}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl bg-[#FBF7F1] p-3.5">
            <span className="flex items-center gap-2 text-sm font-extrabold">
              <LightbulbIcon size={18} weight="bold" className="text-[#C96A2E]" aria-hidden="true" />
              Idées pour faire mieux
            </span>
            {team.improvements.length === 0 ? (
              <p className="m-0 text-[13px] text-[#6B625B]">Les idées de « Comment on pourrait faire mieux » arriveront ici.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {team.improvements.map((idea) => (
                  <li key={idea.id} className="flex flex-col gap-0.5 border-b border-[#EFE6DA] pb-2.5 last:border-b-0 last:pb-0">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#8A4924]">
                      {idea.name} · {idea.dayLabel}
                    </span>
                    <span className="text-sm leading-snug text-[#1F1A16] [overflow-wrap:anywhere]">{idea.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function DeclareAbsenceButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-[#EDE4D8] bg-white px-3.5 text-sm font-bold text-[#8A4924] hover:text-[#C96A2E] sm:h-9",
        className,
      )}
    >
      <MoonStarsIcon size={16} aria-hidden="true" />
      Déclarer une absence
    </button>
  );
}
