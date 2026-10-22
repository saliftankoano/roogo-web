"use client";

// "Donner une tâche" (Assigner.dc.html). Directeur and Fondateur pick anyone;
// a Directeur picking the founder writes a demande with a required "Pourquoi".
// Everyone else only adds a task for themselves. The server checks all of it
// again: this dialog only offers what the API will accept.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import { cn } from "@/lib/utils";
import { CALL_SUBJECT_LABELS, CALL_SUBJECTS, addDays, longDayLabel, type CallSubject } from "@/lib/team-tasks/core";
import type { ComposerPerson, LinkOption } from "@/lib/team-tasks/server";
import { Avatar, announceTasksChanged, callApi, prefersReducedMotion } from "./ui";

type LinkType = "property" | "visit" | "request" | "studio";
const LINK_TYPES: { type: LinkType; label: string }[] = [
  { type: "property", label: "Une annonce" },
  { type: "visit", label: "Une visite" },
  { type: "request", label: "Une demande de bien" },
  { type: "studio", label: "Un projet Studio" },
];

/** Goals offered under « Pour un objectif », with their levers. */
export type ComposerGoal = { id: string; title: string; levers: { id: string; title: string; ownerId: string }[] };

type When = "today" | "tomorrow" | "other";

function nextWorkingDay(key: string) {
  const next = addDays(key, 1);
  return new Date(`${next}T00:00:00Z`).getUTCDay() === 0 ? addDays(next, 1) : next;
}

export function TaskComposer({
  open,
  onClose,
  onCreated,
  people,
  todayKey,
  viewerName,
  viewerLevelLabel,
  presetOwnerId,
  goals = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  people: ComposerPerson[];
  todayKey: string;
  viewerName: string;
  viewerLevelLabel: string;
  presetOwnerId?: string | null;
  goals?: ComposerGoal[];
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const me = people.find((p) => p.isMe) ?? people[0];
  const [ownerId, setOwnerId] = useState<string>(presetOwnerId ?? me?.id ?? "");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<When>("today");
  const [otherDate, setOtherDate] = useState(addDays(todayKey, 2));
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<Partial<Record<LinkType, LinkOption>>>({});
  const [picker, setPicker] = useState<LinkType | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [isCall, setIsCall] = useState(false);
  const [callPhone, setCallPhone] = useState("");
  const [callSubject, setCallSubject] = useState<CallSubject | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [leverId, setLeverId] = useState<string | null>(null);

  const owner = people.find((p) => p.id === ownerId) ?? me;
  const isAsk = owner?.mode === "demande";
  const onlyMe = people.length <= 1;
  const founderName = owner?.isFounder ? owner.firstName : "";

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOwnerId(presetOwnerId ?? (people.find((p) => !p.isMe && p.mode === "manuel")?.id ?? me?.id ?? ""));
    setSent(null);
    setError(null);
    const frame = requestAnimationFrame(() => firstFieldRef.current?.focus());
    if (dialogRef.current && !prefersReducedMotion()) {
      gsap.fromTo(dialogRef.current, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: "power3.out", clearProps: "transform,opacity,visibility" });
    }
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    onClose();
    requestAnimationFrame(() => returnFocus.current?.focus());
  }

  function resetForAnother() {
    setTitle("");
    setNote("");
    setTime("");
    setLinks({});
    setWhen("today");
    setIsCall(false);
    setCallPhone("");
    setCallSubject(null);
    setGoalId(null);
    setLeverId(null);
    setSent(null);
    requestAnimationFrame(() => firstFieldRef.current?.focus());
  }

  const dueDate = when === "today" ? todayKey : when === "tomorrow" ? nextWorkingDay(todayKey) : otherDate;

  const heading = onlyMe
    ? "Ajouter une tâche"
    : isAsk
      ? `Demander à ${founderName}`
      : "Donner une tâche";
  const sendLabel = isAsk
    ? `Envoyer la demande à ${founderName}`
    : owner?.isMe
      ? "Ajouter à mon briefing"
      : `Donner la tâche à ${owner?.firstName ?? ""}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!owner) return;
    setError(null);
    if (!title.trim()) {
      setError("Écrivez ce qu’il faut faire.");
      return;
    }
    if (isAsk && !note.trim()) {
      setError("Dites pourquoi : c’est obligatoire pour une demande.");
      return;
    }
    setSending(true);
    try {
      await callApi("/api/admin/team-tasks", {
        method: "POST",
        body: JSON.stringify({
          ownerId: owner.id,
          title: title.trim(),
          dueDate,
          dueTime: time || null,
          note: isAsk ? null : note.trim() || null,
          reason: isAsk ? note.trim() : null,
          propertyId: links.property?.id ?? null,
          visitRequestId: links.visit?.id ?? null,
          propertyRequestId: links.request?.id ?? null,
          studioProjectId: links.studio?.id ?? null,
          isCall: !isAsk && isCall,
          callPhone: !isAsk && isCall ? callPhone.trim() || null : null,
          callSubject: !isAsk && isCall ? callSubject : null,
          goalId,
          leverId,
        }),
      });
      // Say which day, so a task for later this week is not "lost" (the briefing lists today and tomorrow).
      const day = dueDate === todayKey ? "aujourd’hui" : `le ${longDayLabel(dueDate)}`;
      setSent(
        isAsk
          ? `${founderName} la verra dans ses demandes.`
          : owner.isMe
            ? `Ajoutée à votre briefing pour ${day}.`
            : `${owner.firstName} la verra dans son briefing ${day}.`,
      );
      announceTasksChanged();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "L’envoi a échoué.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-[#1F1A16]/40 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full flex-col overflow-hidden bg-[#F6F1EA] text-[#1F1A16] sm:h-auto sm:max-h-[min(860px,calc(100dvh-3rem))] sm:max-w-lg sm:rounded-[28px] sm:shadow-2xl"
      >
        <header className="flex flex-none items-center gap-2.5 px-4 pb-2 pt-4">
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[#E2D8CC] bg-white text-[#1F1A16]"
          >
            <XIcon size={18} weight="bold" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924]">
              {viewerName} · {viewerLevelLabel}
            </span>
            <h2 id={titleId} className="m-0 text-xl font-extrabold">{heading}</h2>
          </div>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-2">
            {!onlyMe && (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-2 p-0 text-[13px] font-extrabold">Pour qui</legend>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
                  {people.map((person) => {
                    const on = person.id === owner?.id;
                    return (
                      <button
                        key={person.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => { setOwnerId(person.id); setSent(null); }}
                        className={cn(
                          "flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5",
                          on ? "bg-[#FFF4EA] shadow-[0_0_0_2px_#C96A2E]" : "border border-[#E2D8CC] bg-white",
                        )}
                      >
                        <Avatar initials={person.initials} tone={on ? "brand" : person.isFounder ? "clay" : "ink"} />
                        <span className="max-w-full truncate text-sm font-extrabold">{person.isMe ? "Moi" : person.firstName}</span>
                        <span className="text-[11px] text-[#6B625B]">
                          {person.mode === "demande" ? "Demande" : `${person.load} ${person.load > 1 ? "tâches" : "tâche"}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {isAsk && (
                  <p className="m-0 rounded-2xl bg-[#1F1A16] px-3 py-2.5 text-[13px] leading-relaxed text-white">
                    Une demande à {founderName} arrive dans ses « Demandes ». Seuls les directeurs peuvent lui en envoyer. Dites ce qu’il vous faut et pourquoi.
                  </p>
                )}
              </fieldset>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${titleId}-quoi`} className="text-[13px] font-extrabold">Quoi</label>
              <input
                ref={firstFieldRef}
                id={`${titleId}-quoi`}
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={isAsk ? "Ce qu’il vous faut" : "Ce qu’il faut faire"}
                className="h-12 rounded-2xl border border-[#E2D8CC] bg-white px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E]"
              />
            </div>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-[13px] font-extrabold">Pour quand</legend>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ["today", "Aujourd’hui"],
                  ["tomorrow", "Demain"],
                  ["other", "Autre date…"],
                ] as [When, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={when === value}
                    onClick={() => setWhen(value)}
                    className={cn(
                      "h-11 cursor-pointer rounded-full px-4 text-sm font-bold",
                      when === value ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white text-[#1F1A16]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {when === "other" && (
                <div className="flex items-center gap-2">
                  <label htmlFor={`${titleId}-date`} className="text-[13px] text-[#6B625B]">Le</label>
                  <input
                    id={`${titleId}-date`}
                    type="date"
                    min={todayKey}
                    value={otherDate}
                    onChange={(event) => setOtherDate(event.target.value)}
                    className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-[15px]"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <label htmlFor={`${titleId}-heure`} className="text-[13px] text-[#6B625B]">Avant</label>
                <input
                  id={`${titleId}-heure`}
                  type="time"
                  step={300}
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="h-11 w-32 rounded-xl border border-[#E2D8CC] bg-white px-3 text-[15px]"
                />
                <span className="text-xs text-[#6B625B]">facultatif, heure de Ouagadougou</span>
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-extrabold" id={`${titleId}-lier`}>Lier à (facultatif)</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${titleId}-lier`}>
                {LINK_TYPES.map(({ type, label }) => {
                  const chosen = links[type];
                  if (chosen) {
                    return (
                      <span key={type} className="inline-flex h-10 max-w-full items-center gap-1 rounded-full bg-[#F7E4D3] pl-3 pr-1 text-[13px] font-bold text-[#8A4924]">
                        <span className="truncate">{chosen.label}</span>
                        <button
                          type="button"
                          aria-label={`Retirer le lien ${chosen.label}`}
                          onClick={() => setLinks((current) => ({ ...current, [type]: undefined }))}
                          className="inline-flex size-8 items-center justify-center rounded-full hover:bg-white/60"
                        >
                          <XIcon size={14} weight="bold" />
                        </button>
                      </span>
                    );
                  }
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-expanded={picker === type}
                      onClick={() => setPicker((current) => (current === type ? null : type))}
                      className={cn(
                        "h-10 cursor-pointer rounded-full border border-dashed border-[#D6CBBE] px-3 text-[13px] font-bold",
                        picker === type ? "bg-white" : "bg-transparent",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {picker && (
                <LinkPicker
                  type={picker}
                  onPick={(option) => {
                    setLinks((current) => ({ ...current, [picker]: option }));
                    setPicker(null);
                  }}
                />
              )}
            </div>

            {!isAsk && (
              <div className="flex flex-col gap-2 rounded-2xl border border-[#EAE1D5] bg-white p-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <span className="flex flex-1 flex-col">
                    <span className="text-[13px] font-extrabold">C’est un appel</span>
                    <span className="text-xs text-[#6B625B]">Tag « Appel » et « Appeler et noter ». La tâche se coche une fois le résultat noté.</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={isCall}
                    onChange={(event) => setIsCall(event.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="relative h-7 w-12 shrink-0 rounded-full bg-[#D6CBBE] transition-colors peer-checked:bg-[#C96A2E] peer-focus-visible:ring-2 peer-focus-visible:ring-[#C96A2E] peer-focus-visible:ring-offset-2 after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"
                  />
                </label>
                {isCall && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${titleId}-tel`} className="text-xs font-extrabold text-[#6B625B]">Numéro à appeler (facultatif)</label>
                      <input
                        id={`${titleId}-tel`}
                        type="tel"
                        inputMode="tel"
                        maxLength={40}
                        value={callPhone}
                        onChange={(event) => setCallPhone(event.target.value)}
                        placeholder="+226 70 00 00 00"
                        className="h-11 rounded-xl border border-[#E2D8CC] bg-[#FBF7F1] px-3 text-[15px]"
                      />
                    </div>
                    <div className="flex flex-col gap-1" role="group" aria-label="Avec qui">
                      <span className="text-xs font-extrabold text-[#6B625B]">Avec qui</span>
                      <div className="flex flex-wrap gap-1.5">
                        {CALL_SUBJECTS.map((value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={callSubject === value}
                            onClick={() => setCallSubject(callSubject === value ? null : value)}
                            className={cn(
                              "h-10 cursor-pointer rounded-full px-3 text-[13px] font-bold",
                              callSubject === value ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white",
                            )}
                          >
                            {CALL_SUBJECT_LABELS[value]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {goals.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-extrabold" id={`${titleId}-goal`}>Pour un objectif (facultatif)</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${titleId}-goal`}>
                  {goals.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      aria-pressed={goalId === goal.id}
                      onClick={() => {
                        setGoalId(goalId === goal.id ? null : goal.id);
                        setLeverId(null);
                      }}
                      className={cn(
                        "h-10 max-w-full cursor-pointer truncate rounded-full px-3 text-[13px] font-bold",
                        goalId === goal.id ? "bg-[#F7E4D3] text-[#8A4924] shadow-[inset_0_0_0_2px_#C96A2E]" : "border border-dashed border-[#D6CBBE] bg-transparent",
                      )}
                    >
                      {goal.title}
                    </button>
                  ))}
                </div>
                {goalId && (goals.find((g) => g.id === goalId)?.levers.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Levier">
                    {goals
                      .find((g) => g.id === goalId)!
                      .levers.slice()
                      .sort((a, b) => Number(b.ownerId === owner?.id) - Number(a.ownerId === owner?.id))
                      .map((lever) => (
                        <button
                          key={lever.id}
                          type="button"
                          aria-pressed={leverId === lever.id}
                          onClick={() => setLeverId(leverId === lever.id ? null : lever.id)}
                          className={cn(
                            "min-h-10 max-w-full cursor-pointer rounded-full px-3 text-left text-xs font-bold",
                            leverId === lever.id ? "bg-[#1F1A16] text-white" : "border border-[#E2D8CC] bg-white",
                          )}
                        >
                          Levier : {lever.title}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${titleId}-note`} className="text-[13px] font-extrabold">
                {isAsk ? "Pourquoi (obligatoire)" : "Note"}
              </label>
              <textarea
                id={`${titleId}-note`}
                rows={3}
                value={note}
                maxLength={2000}
                required={isAsk}
                aria-required={isAsk}
                onChange={(event) => setNote(event.target.value)}
                className="resize-y rounded-2xl border border-[#E2D8CC] bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E]"
              />
            </div>
            {error && (
              <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-3 py-2.5 text-sm font-semibold text-[#8E2A1E]">
                {error}
              </p>
            )}
          </div>

          <div className="flex-none border-t border-[#EAE1D5] bg-white px-4 pb-6 pt-3 sm:pb-4">
            {sent ? (
              <div className="flex min-h-[54px] items-center gap-2.5" role="status">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2F7A48] text-white">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="flex-1 text-[15px] font-extrabold text-[#245C33]">{sent}</span>
                <button type="button" onClick={resetForAnother} className="h-11 rounded-full border border-[#E2D8CC] bg-white px-3.5 text-[13px] font-bold">
                  Une autre
                </button>
                <button type="button" onClick={close} className="h-11 rounded-full bg-[#1F1A16] px-3.5 text-[13px] font-bold text-white">
                  Fermer
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={sending}
                className="h-[54px] w-full cursor-pointer rounded-full bg-[#C96A2E] text-base font-extrabold text-white transition-colors hover:bg-[#8A4924] disabled:cursor-wait disabled:opacity-70"
              >
                {sending ? "Envoi…" : sendLabel}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function LinkPicker({ type, onPick }: { type: LinkType; onPick: (option: LinkOption) => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<LinkOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const placeholder = useMemo(
    () => ({ property: "Référence ou quartier", visit: "Filtrer les visites", request: "Titre ou quartier", studio: "Nom du projet" })[type],
    [type],
  );

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const body = await callApi<{ options: LinkOption[] }>(
          `/api/admin/team-tasks/links?type=${type}&q=${encodeURIComponent(query)}`,
        );
        if (alive) {
          setOptions(body.options);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Chargement impossible.");
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [type, query]);

  const visible = (options ?? []).filter((option) =>
    type === "visit" && query ? `${option.label} ${option.sub}`.toLowerCase().includes(query.toLowerCase()) : true,
  );

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#EAE1D5] bg-white p-2">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-[#F6F1EA] px-3">
        <MagnifyingGlassIcon size={16} weight="bold" aria-hidden="true" className="text-[#6B625B]" />
        <span className="sr-only">Rechercher</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-controls={listId}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <ul id={listId} className="m-0 flex max-h-52 list-none flex-col overflow-y-auto p-0">
        {error && <li className="px-2 py-2 text-sm text-[#8E2A1E]">{error}</li>}
        {!error && options === null && <li className="px-2 py-2 text-sm text-[#6B625B]">Chargement…</li>}
        {!error && options !== null && visible.length === 0 && <li className="px-2 py-2 text-sm text-[#6B625B]">Rien trouvé.</li>}
        {visible.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onPick(option)}
              className="flex min-h-11 w-full cursor-pointer flex-col items-start justify-center rounded-xl px-2 py-1.5 text-left hover:bg-[#FBF7F1]"
            >
              <span className="text-sm font-bold">{option.label}</span>
              {option.sub && <span className="text-xs text-[#6B625B]">{option.sub}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
