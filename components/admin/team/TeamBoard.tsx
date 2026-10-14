"use client";

// "L’équipe" (Equipe.dc.html on desktop, EquipeMobile.dc.html on phone).
// Directeur and Fondateur only; the page and the API both check it.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CaretDownIcon, PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LEVEL_LABELS, STAFF_TITLES, type DemandeView, type StaffTitle } from "@/lib/team-tasks/core";
import type { BoardPayload, BoardViewColumn } from "@/lib/team-tasks/server";
import { AsksBlock } from "./AsksBlock";
import { SetupNotice } from "./BriefingView";
import { TaskComposer } from "./TaskComposer";
import {
  Avatar,
  CreamBackdrop,
  DoneTick,
  Flag,
  SectionLabel,
  ViewSwitch,
  animateOpen,
  animatePanel,
  announceTasksChanged,
  callApi,
  useEntrance,
} from "./ui";

export function TeamBoard({ initial, todayKey, viewerName, viewerLevelLabel }: {
  initial: BoardPayload;
  todayKey: string;
  viewerName: string;
  viewerLevelLabel: string;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEntrance(rootRef, "[data-col]", []);

  const refresh = useCallback(async () => {
    try {
      const body = await callApi<{ board: BoardPayload }>("/api/admin/team-tasks/team");
      setData(body.board);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le tableau n’a pas pu se recharger.");
    }
  }, []);

  const run = useCallback(async (key: string, request: () => Promise<unknown>) => {
    setError(null);
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await request();
      announceTasksChanged();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "L’action a échoué.");
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[key];
        return next;
      });
    }
  }, [refresh]);

  const columns = [...data.columns, data.unassigned];
  const selected = columns[Math.min(tab, columns.length - 1)];

  useEffect(() => {
    animatePanel(panelRef.current);
  }, [tab]);

  const actions: ColumnActions = {
    busy,
    viewerId: data.viewerId,
    viewerIsFounder: data.viewerIsFounder,
    assignees: data.assignees,
    titlesReady: data.titlesReady,
    titleOf: (userId) => data.titles.find((t) => t.userId === userId)?.title ?? null,
    onAssign: (key, ownerId) =>
      run(key, () => callApi("/api/admin/team-tasks/auto", { method: "POST", body: JSON.stringify({ action: "assign", key, ownerId }) })),
    onAccept: (ask) =>
      run(`ask:${ask.id}`, () => callApi(`/api/admin/team-tasks/${ask.id}`, { method: "PATCH", body: JSON.stringify({ action: "accept" }) })),
    onReply: (ask, text) =>
      run(`ask:${ask.id}`, () => callApi(`/api/admin/team-tasks/${ask.id}`, { method: "PATCH", body: JSON.stringify({ action: "reply", text }) })),
    onTitle: (userId, title) =>
      run(`title:${userId}`, () => callApi("/api/admin/team-tasks/titles", { method: "PUT", body: JSON.stringify({ userId, title }) })),
  };

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 pb-20 text-[#1F1A16] lg:gap-5 lg:pb-0">
      <CreamBackdrop />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <ViewSwitch active="equipe" />
        <div className="flex min-w-0 flex-col">
          <h1 className="m-0 text-xl font-extrabold lg:text-[26px]">
            <span className="lg:hidden">{data.weekShortTitle}</span>
            <span className="hidden lg:inline">{data.weekTitle}</span>
          </h1>
          <span className="text-xs text-[#6B625B] lg:text-[13px]">
            <span className="hidden lg:inline">{data.todayLabel} · les tâches faites restent visibles jusqu’à samedi soir, puis la semaine se range en bas.</span>
            <span className="lg:hidden">Les tâches faites restent jusqu’à samedi soir.</span>
          </span>
        </div>
        <span className="hidden flex-1 lg:block" />
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="hidden h-11 items-center gap-1.5 rounded-full bg-[#C96A2E] pl-3.5 pr-[18px] text-sm font-extrabold text-white hover:bg-[#8A4924] lg:inline-flex"
        >
          <PlusIcon size={16} weight="bold" aria-hidden="true" />
          Donner une tâche
        </button>
      </div>

      {!data.tasksReady && <SetupNotice />}
      {data.failedSources.length > 0 && (
        <p className="m-0 rounded-2xl bg-[#FCEFD4] px-4 py-3 text-sm font-semibold text-[#6E4300]" role="status">
          Certaines tâches automatiques n’ont pas pu être chargées. Les autres sont à jour.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
          {error}
        </p>
      )}

      {/* Phone: person tabs. */}
      <div className="lg:hidden">
        <div role="tablist" aria-label="Personnes" className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-1.5 pt-1 [scrollbar-width:none]">
          {columns.map((column, index) => {
            const on = index === tab;
            const name = column.person ? column.person.firstName.replace(" (moi)", "") : "Sans resp.";
            return (
              <button
                key={column.person?.id ?? "unassigned"}
                role="tab"
                id={`tab-${index}`}
                aria-selected={on}
                aria-controls="team-panel"
                onClick={() => setTab(index)}
                className={cn(
                  "relative flex min-h-[72px] min-w-[68px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2",
                  on ? "bg-white shadow-[0_0_0_2px_#C96A2E]" : "border border-[#EAE1D5] bg-white/70",
                )}
              >
                <Avatar
                  size={34}
                  initials={column.person?.initials ?? "?"}
                  tone={column.person ? (column.person.isMe ? "brand" : "ink") : "muted"}
                />
                <span className="whitespace-nowrap text-xs font-extrabold">{name}</span>
                {column.flag && column.flag.tone !== "green" && (
                  <span
                    className={cn(
                      "absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold",
                      column.flag.tone === "red" ? "bg-[#8E2A1E] text-white" : "bg-[#E8A33D] text-[#1F1A16]",
                    )}
                    aria-label={column.flag.label}
                  >
                    {column.flag.label.split(" ")[0]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div ref={panelRef} id="team-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-2">
          <Column column={selected} actions={actions} variant="phone" />
        </div>
      </div>

      {/* Desktop: one column per person, scrolling inside its own box. */}
      <div className="-m-1.5 hidden overflow-x-auto p-1.5 pb-2.5 lg:block">
        <div
          className="grid items-start gap-3.5"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(256px, 1fr))`, minWidth: columns.length * 270 }}
        >
          {columns.map((column) => (
            <Column key={column.person?.id ?? "unassigned"} column={column} actions={actions} variant="desktop" />
          ))}
        </div>
      </div>

      <PastWeeks weeks={data.pastWeeks} />

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        aria-label="Donner une tâche"
        className="fixed bottom-6 right-4 z-40 inline-flex h-14 items-center gap-1.5 rounded-full bg-[#C96A2E] pl-4 pr-5 text-[15px] font-extrabold text-white shadow-[0_14px_30px_-12px_rgba(201,106,46,0.8)] lg:hidden"
      >
        <PlusIcon size={18} weight="bold" aria-hidden="true" />
        Tâche
      </button>

      <TaskComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={refresh}
        people={data.people}
        todayKey={todayKey}
        viewerName={viewerName}
        viewerLevelLabel={viewerLevelLabel}
      />
    </div>
  );
}

type ColumnActions = {
  busy: Record<string, boolean>;
  viewerId: string;
  viewerIsFounder: boolean;
  assignees: BoardPayload["assignees"];
  titlesReady: boolean;
  titleOf: (userId: string) => StaffTitle | null;
  onAssign: (key: string, ownerId: string) => void;
  onAccept: (ask: DemandeView) => void;
  onReply: (ask: DemandeView, text: string) => void;
  onTitle: (userId: string, title: StaffTitle) => void;
};

function Column({ column, actions, variant }: { column: BoardViewColumn; actions: ColumnActions; variant: "phone" | "desktop" }) {
  const person = column.person;
  const unassigned = !person;
  const desktop = variant === "desktop";
  const canEditTitle = actions.viewerIsFounder && actions.titlesReady && person && !person.isFounder;
  const titleId = useId();
  return (
    <section
      aria-label={person ? person.firstName : "Sans responsable"}
      data-col
      className={cn(
        "flex min-w-0 flex-col gap-2.5",
        desktop && "rounded-[20px] p-3.5",
        desktop && person?.isMe && "border-2 border-[#C96A2E] bg-white p-[13px] shadow-[0_12px_28px_-18px_rgba(201,106,46,0.7)]",
        desktop && unassigned && "border border-dashed border-[#D6CBBE] bg-[#FBF7F1]",
        desktop && person && !person.isMe && "border border-[#EAE1D5] bg-white",
      )}
    >
      <div className="flex items-center gap-2.5">
        {desktop && <Avatar initials={person?.initials ?? "?"} tone={person ? (person.isMe ? "brand" : "ink") : "muted"} />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate font-extrabold", desktop ? "text-base" : "text-lg")}>{person ? person.firstName : "Sans responsable"}</span>
          {canEditTitle ? (
            <label className="flex items-center gap-1 text-xs text-[#6B625B]" htmlFor={titleId}>
              <span className="sr-only">Titre de {person.firstName}</span>
              <select
                id={titleId}
                value={actions.titleOf(person.id) ?? "conseillere"}
                disabled={!!actions.busy[`title:${person.id}`]}
                onChange={(event) => actions.onTitle(person.id, event.target.value as StaffTitle)}
                className="-ml-1 h-8 max-w-full cursor-pointer rounded-lg bg-transparent px-1 text-xs text-[#6B625B] hover:bg-[#F6F1EA]"
              >
                {STAFF_TITLES.map((title) => (
                  <option key={title} value={title}>{LEVEL_LABELS[title]}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-xs text-[#6B625B]">{person ? person.levelLabel : "Arrivé seul, à attribuer"}</span>
          )}
        </span>
        {column.flag && <Flag tone={column.flag.tone}>{column.flag.label}</Flag>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={cn("flex flex-col rounded-xl px-2.5 py-2", desktop ? "bg-[#FBF7F1]" : "border border-[#EAE1D5] bg-white")}>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#6B625B]">Aujourd’hui</span>
          <span className="whitespace-nowrap text-base font-extrabold">
            {unassigned ? `${column.open.length} en attente` : `${column.todayDone} sur ${column.todayTotal}`}
          </span>
        </div>
        <div className="flex flex-col rounded-xl bg-[#E3F1E6] px-2.5 py-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#245C33]">Semaine</span>
          <span className="whitespace-nowrap text-base font-extrabold text-[#245C33]">
            {unassigned ? "·" : `${column.weekDone} ${column.weekDone > 1 ? "faites" : "faite"}`}
          </span>
        </div>
      </div>

      {column.asks.length > 0 && (
        <AsksBlock
          asks={column.asks}
          busy={actions.busy}
          compact={desktop}
          readOnly={person?.id !== actions.viewerId}
          onAccept={actions.onAccept}
          onReply={actions.onReply}
        />
      )}

      <SectionLabel as="h3" className={cn("text-xs", !desktop && "mt-1")}>À faire</SectionLabel>
      {column.open.length === 0 && <p className="m-0 text-[13px] text-[#6B625B]">Rien en attente.</p>}
      {column.open.map((item) => (
        <div
          key={item.key}
          className={cn(
            "flex flex-col gap-0.5 rounded-xl px-2.5 py-2",
            item.late ? "bg-[#FBE3DF]" : item.current ? "bg-[#FFF4EA] shadow-[inset_0_0_0_1px_#F0C9A6]" : "border border-[#EFE6DA] bg-white",
          )}
        >
          <span className={cn("text-[11px] font-extrabold", item.late ? "text-[#8E2A1E]" : item.current ? "text-[#C96A2E]" : "text-[#6B625B]")}>
            {item.when}
            {item.late && <span className="sr-only"> (en retard)</span>}
          </span>
          {item.href ? (
            <a href={item.href} className={cn("font-bold leading-snug text-[#1F1A16] no-underline hover:underline [overflow-wrap:anywhere]", desktop ? "text-[13px]" : "text-sm")}>
              {item.title}
            </a>
          ) : (
            <span className={cn("font-bold leading-snug [overflow-wrap:anywhere]", desktop ? "text-[13px]" : "text-sm")}>{item.title}</span>
          )}
          {unassigned && actions.assignees.length > 0 && (
            <AssignMenu itemKey={item.key} itemTitle={item.title} busy={!!actions.busy[item.key]} assignees={actions.assignees} onAssign={actions.onAssign} />
          )}
        </div>
      ))}

      {!unassigned && (
        <>
          <SectionLabel as="h3" className="mt-1 text-xs text-[#245C33]">Fait cette semaine</SectionLabel>
          {column.doneDays.length === 0 && <p className="m-0 text-[13px] text-[#6B625B]">Rien encore.</p>}
          <div className={cn("flex flex-col gap-2.5", !desktop && column.doneDays.length > 0 && "rounded-2xl border border-[#EAE1D5] bg-white p-3")}>
            {column.doneDays.map((day) => (
              <div key={day.key} className="flex flex-col gap-1">
                <span className="text-[11px] font-extrabold text-[#6B625B]">{day.label}</span>
                {day.items.map((done) => (
                  <div key={done.key} className="flex items-start gap-2">
                    <DoneTick size={desktop ? 18 : 20} />
                    <span className={cn("leading-snug text-[#4A4540] [overflow-wrap:anywhere]", desktop ? "text-[13px]" : "text-sm")}>{done.title}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AssignMenu({ itemKey, itemTitle, busy, assignees, onAssign }: {
  itemKey: string;
  itemTitle: string;
  busy: boolean;
  assignees: BoardPayload["assignees"];
  onAssign: (key: string, ownerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative mt-1 self-start">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Attribuer : ${itemTitle}`}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-full border border-[#E2D8CC] bg-white px-3 text-[13px] font-bold disabled:cursor-wait disabled:opacity-60 lg:h-8 lg:text-xs"
      >
        {busy ? "Attribution…" : "Attribuer"}
        <CaretDownIcon size={12} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute left-0 top-full z-20 mt-1.5 w-48 rounded-2xl border border-[#EAE1D5] bg-white p-1.5 shadow-xl">
          {assignees.map((person) => (
            <button
              key={person.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAssign(itemKey, person.id);
              }}
              className="flex min-h-11 w-full cursor-pointer items-center rounded-xl px-3 text-left text-sm font-bold hover:bg-[#FBF7F1]"
            >
              {person.isMe ? `${person.firstName} (moi)` : person.firstName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PastWeeks({ weeks }: { weeks: BoardPayload["pastWeeks"] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const detailRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (openId) animateOpen(detailRefs.current[openId]);
  }, [openId]);
  return (
    <section aria-labelledby="semaines-precedentes" className="flex flex-col gap-2.5">
      <SectionLabel className="mt-2">
        <span id="semaines-precedentes">Semaines précédentes</span>
      </SectionLabel>
      {weeks.length === 0 && <p className="m-0 text-sm text-[#6B625B]">Les semaines terminées se rangeront ici, chaque dimanche.</p>}
      {weeks.map((week) => {
        const open = openId === week.id;
        return (
          <div key={week.id} className="overflow-hidden rounded-2xl border border-[#EAE1D5] bg-white lg:rounded-[20px]">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`week-${week.id}`}
              onClick={() => setOpenId(open ? null : week.id)}
              className="flex min-h-[60px] w-full cursor-pointer flex-wrap items-center gap-2.5 border-0 bg-transparent px-3 py-2.5 text-left text-inherit lg:min-h-16 lg:gap-3.5 lg:px-4 lg:py-3"
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#E3F1E6] text-[#245C33] lg:size-10">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col lg:min-w-[200px] lg:flex-none">
                <span className="text-sm font-extrabold lg:text-base">
                  {week.label} · {week.total} {week.total > 1 ? "tâches faites" : "tâche faite"}
                </span>
                <span className="text-xs text-[#6B625B] lg:text-[13px]">{open ? "Cliquer pour replier" : "Cliquer pour revoir le détail"}</span>
              </span>
              <span className="hidden flex-1 lg:block" />
              <span className="hidden flex-wrap gap-1.5 lg:flex">
                {week.people.map((p) => (
                  <span key={p.personId} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#F6F1EA] px-2.5 text-xs font-extrabold">
                    {p.name}
                    <span className="text-[#245C33]">{p.count}</span>
                  </span>
                ))}
              </span>
              <CaretDownIcon size={18} weight="bold" aria-hidden="true" className={cn("text-[#6B625B] transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <div
                id={`week-${week.id}`}
                ref={(el) => {
                  detailRefs.current[week.id] = el;
                }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-3 px-3 pb-3 pt-1 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] lg:px-4 lg:pb-4">
                  {week.people.map((p) => (
                    <div key={p.personId} className="flex flex-col gap-1.5 rounded-2xl bg-[#FBF7F1] p-3">
                      <span className="text-sm font-extrabold">{p.name} · {p.count} {p.count > 1 ? "faites" : "faite"}</span>
                      {p.items.map((title, index) => (
                        <span key={index} className="flex gap-1.5 text-[13px] text-[#4A4540]">
                          <span aria-hidden="true" className="font-extrabold text-[#2F7A48]">✓</span>
                          <span className="[overflow-wrap:anywhere]">{title}</span>
                        </span>
                      ))}
                      {p.count > p.items.length && (
                        <span className="text-xs font-bold text-[#8A4924]">+ {p.count - p.items.length} autres</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
