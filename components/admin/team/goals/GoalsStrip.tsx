"use client";

// « Nos objectifs » on Mon espace (Bureau.dc.html on desktop, Main.dc.html on
// the phone): every goal with its icon, current / target, bar, status, period
// and countdown; period tabs with counts; « Ma part cette semaine ». A goal
// opens its evidence. The founder adds and removes goals here.

import Link from "next/link";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { PRINCIPLE, type PeriodTab } from "@/lib/team-goals/core";
import type { GoalView, GoalsPayload, LeverView } from "@/lib/team-goals/server";
import { prefersReducedMotion, SectionLabel } from "../ui";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { GoalForm } from "./GoalForm";
import { GoalIcon, STATUS_CHIP, STATUS_FILL, TAB_BADGE } from "./GoalIcon";
import { useGoals, type GoalsApi } from "./useGoals";

type Tab = "tous" | PeriodTab;
const TABS: [Tab, string][] = [
  ["tous", "Tous"],
  ["mois", "Ce mois"],
  ["trimestre", "Ce trimestre"],
  ["annee", "Cette année"],
];

export function useGoalsUi(initial: GoalsPayload) {
  const goals = useGoals(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [undo, setUndo] = useState<GoalView | null>(null);
  const open = goals.data.goals.find((g) => g.id === openId) ?? null;
  return { ...goals, open, setOpenId, adding, setAdding, undo, setUndo };
}

export type GoalsUi = ReturnType<typeof useGoalsUi>;

/** Drawer and form, rendered once per page. */
export function GoalsOverlays({ ui }: { ui: GoalsUi }) {
  return (
    <>
      <EvidenceDrawer
        goal={ui.open}
        data={ui.data}
        api={ui.api}
        busy={ui.busy}
        error={ui.error}
        onClose={() => {
          ui.setOpenId(null);
          ui.setError(null);
        }}
        onRemoved={(goal) => {
          ui.setOpenId(null);
          ui.setUndo(goal);
        }}
      />
      {ui.data.canManage && (
        <GoalForm
          open={ui.adding}
          onClose={() => ui.setAdding(false)}
          onCreated={() => ui.setAdding(false)}
          data={ui.data}
          api={ui.api}
          busy={!!ui.busy.create}
        />
      )}
    </>
  );
}

export function UndoToast({ ui }: { ui: GoalsUi }) {
  const goal = ui.undo;
  useEffect(() => {
    if (!goal) return;
    const timer = setTimeout(() => ui.setUndo(null), 12000);
    return () => clearTimeout(timer);
  }, [goal, ui]);
  if (!goal) return null;
  return (
    <div role="status" className="inline-flex min-h-10 max-w-full flex-wrap items-center gap-2.5 self-start rounded-[20px] bg-[#1F1A16] py-1.5 pl-3.5 pr-1.5 text-[13px] font-bold text-white">
      <span className="min-w-0 flex-1">« {goal.title} » retiré. L’équipe ne le voit plus.</span>
      <button
        type="button"
        onClick={async () => {
          const ok = await ui.api.restore(goal.id);
          if (ok) ui.setUndo(null);
        }}
        className="h-8 cursor-pointer rounded-full bg-white px-3 text-xs font-extrabold text-[#1F1A16]"
      >
        Annuler
      </button>
    </div>
  );
}

function GoalCard({ goal, onOpen }: { goal: GoalView; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-goal={goal.id}
      onClick={onOpen}
      aria-label={`${goal.title}, ${goal.currentLabel} sur ${goal.targetLabel}, ${goal.statusLabel}. Voir les preuves`}
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-[14px] border-0 bg-[#FBF7F1] p-3 text-left text-[#1F1A16] shadow-[inset_0_0_0_1px_#EFE6DA] transition-shadow duration-200 hover:shadow-[inset_0_0_0_2px_#C96A2E]",
        "w-[220px] shrink-0 snap-start lg:w-auto",
      )}
    >
      <span className="flex w-full items-center gap-2.5">
        <GoalIcon kind={goal.icon} />
        <span className="min-w-0 flex-1 text-[13px] font-extrabold leading-tight">{goal.title}</span>
      </span>
      <span className="flex w-full items-baseline gap-1.5">
        <span className="text-[22px] font-extrabold leading-none">{goal.currentLabel}</span>
        <span className="text-xs font-bold text-[#6B625B]">/ {goal.targetLabel}</span>
        <span className="flex-1" />
        <span className={cn("inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[10px] font-extrabold", STATUS_CHIP[goal.tone])}>
          {goal.statusLabel}
        </span>
      </span>
      <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-[#EFE6DA]">
        <span data-gfill className={cn("block h-full origin-left rounded-full", STATUS_FILL[goal.tone])} style={{ width: `${Math.max(goal.pct, 2)}%` }} />
      </span>
      <span className="flex w-full items-center gap-1.5">
        <span className={cn("inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md px-[7px] text-[10px] font-extrabold", TAB_BADGE[goal.tab])}>
          {goal.periodLabel}
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-[11px] font-bold text-[#6B625B]">{goal.countdown}</span>
      </span>
    </button>
  );
}

/** The strip itself. */
export function GoalsStrip({ ui }: { ui: GoalsUi }) {
  const { data } = ui;
  const [tab, setTab] = useState<Tab>("tous");
  const rootRef = useRef<HTMLElement>(null);
  const counts = useMemo(() => {
    const out: Record<Tab, number> = { tous: data.goals.length, mois: 0, trimestre: 0, annee: 0 };
    for (const goal of data.goals) out[goal.tab] += 1;
    return out;
  }, [data.goals]);
  const shown = data.goals.filter((goal) => tab === "tous" || goal.tab === tab);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const fills = root.querySelectorAll("[data-gfill]");
    if (!fills.length) return;
    const tween = gsap.fromTo(fills, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power3.out", stagger: 0.04, delay: 0.15, clearProps: "transform" });
    return () => {
      tween.kill();
    };
  }, [tab, data.goals.length]);

  if (!data.ready) {
    return (
      <p data-anim className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] bg-white px-4 py-3 text-sm text-[#4A4540]" role="status">
        Nos objectifs ne sont pas encore installés (migration 091 à lancer).
      </p>
    );
  }

  const emptyText =
    tab === "mois"
      ? data.canManage
        ? "Aucun objectif pour ce mois. Ajoutez-en un, par exemple 10 nouveaux biens en ligne chaque mois."
        : "Aucun objectif pour ce mois."
      : data.canManage && !data.goals.length
        ? "Aucun objectif pour l’instant. Ajoutez le premier."
        : "Aucun objectif sur cette période.";

  return (
    <section ref={rootRef} data-anim aria-labelledby="nos-objectifs" className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-[#EAE1D5] bg-white p-3.5 lg:rounded-[24px] lg:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SectionLabel>
          <span id="nos-objectifs">Nos objectifs</span>
        </SectionLabel>
        <div role="tablist" aria-label="Période" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#F4EEE6] p-[3px]">
          {TABS.map(([value, label]) => {
            const on = tab === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full pl-3 pr-2.5 text-xs font-extrabold lg:h-8",
                  on ? "bg-white text-[#C96A2E] shadow-[0_1px_3px_rgba(31,26,22,0.12)]" : "text-[#6B625B]",
                )}
              >
                {label}
                <span className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[10px]", on ? "bg-[#C96A2E] text-white" : "bg-[#E9DFD2] text-[#6B625B]")}>
                  {counts[value]}
                </span>
              </button>
            );
          })}
        </div>
        <span className="hidden flex-[1_1_260px] text-sm font-bold text-[#4A4540] lg:block">« {PRINCIPLE} »</span>
        <Link href="/admin/objectifs" className="ml-auto inline-flex min-h-11 items-center whitespace-nowrap text-sm font-extrabold text-[#8A4924] hover:text-[#5A321A] lg:ml-0 lg:min-h-0">
          Voir les leviers
        </Link>
      </div>

      {/* Phone: a row that scrolls inside the card. Desktop: a grid. */}
      <div role="tabpanel" className="-mx-3.5 flex snap-x gap-2 overflow-x-auto px-3.5 pb-1 lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] lg:overflow-visible lg:px-0 lg:pb-0">
        {shown.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onOpen={() => ui.setOpenId(goal.id)} />
        ))}
        {shown.length === 0 && (
          <div className="flex min-h-[120px] w-full items-center justify-center rounded-[14px] bg-[#FBF7F1] p-3 text-center text-[13px] font-bold text-[#6B625B] lg:min-h-[132px]">
            {emptyText}
          </div>
        )}
        {data.canManage && (
          <button
            type="button"
            onClick={() => ui.setAdding(true)}
            className="flex min-h-[120px] w-[160px] shrink-0 cursor-pointer snap-start items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[#D6CBBE] bg-transparent px-3 text-sm font-extrabold text-[#8A4924] hover:border-[#C96A2E] lg:min-h-[132px] lg:w-auto"
          >
            <PlusIcon size={18} weight="bold" aria-hidden="true" />
            Ajouter un objectif
          </button>
        )}
      </div>

      <UndoToast ui={ui} />
      {ui.error && !ui.open && (
        <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-3 py-2 text-sm font-semibold text-[#8E2A1E]">{ui.error}</p>
      )}
      {data.failedMetrics.length > 0 && (
        <p className="m-0 text-xs font-bold text-[#6E4300]" role="status">Un chiffre n’a pas pu se charger. Rechargez la page dans un instant.</p>
      )}

      {/* Phone: my share, in the same card (Main.dc.html). */}
      <MySharePhone mine={data.mine} totals={data.mineTotals} />
    </section>
  );
}

function MySharePhone({ mine, totals }: { mine: LeverView[]; totals: { done: number; target: number } }) {
  if (!mine.length) return null;
  const next = mine.find((l) => l.done < l.weeklyTarget);
  return (
    <div className="flex flex-col gap-0.5 border-t border-[#F0E8DD] pt-2.5 lg:hidden">
      <span className="text-sm font-extrabold leading-snug">Ma part cette semaine : {totals.done} sur {totals.target}</span>
      <span className="text-xs leading-snug text-[#6B625B]">
        {next ? `À faire : ${next.title} (${next.done} / ${next.weeklyTarget})` : "Tous vos leviers sont tenus cette semaine. Bravo."}
      </span>
    </div>
  );
}

/** « Ma part cette semaine » (desktop aside, and the goals page for the team). */
export function MyShare({ mine, totals, api, busy, className }: {
  mine: LeverView[];
  totals: { done: number; target: number };
  api: GoalsApi;
  busy: Record<string, boolean>;
  className?: string;
}) {
  if (!mine.length) return null;
  return (
    <section aria-labelledby="ma-part" className={cn("flex flex-col gap-2.5 rounded-[20px] bg-white p-4 shadow-[inset_0_0_0_2px_#C96A2E]", className)}>
      <h2 id="ma-part" className="m-0 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">
        Ma part cette semaine · {totals.done} sur {totals.target}
      </h2>
      {mine.map((lever) => (
        <LeverTickRow key={lever.id} lever={lever} api={api} busy={!!busy[`lever:${lever.id}`]} />
      ))}
    </section>
  );
}

export function LeverTickRow({ lever, api, busy, showGoal = true }: { lever: LeverView; api: GoalsApi; busy: boolean; showGoal?: boolean }) {
  const held = lever.done >= lever.weeklyTarget;
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", held ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-extrabold leading-snug [overflow-wrap:anywhere]">{lever.title}</span>
        {showGoal && <span className="text-xs text-[#6B625B] [overflow-wrap:anywhere]">Pour : {lever.goalTitle}</span>}
      </div>
      <span className="whitespace-nowrap text-[13px] font-extrabold" aria-label={`${lever.done} sur ${lever.weeklyTarget} cette semaine`}>
        {lever.done} / {lever.weeklyTarget}
      </span>
      {lever.canTick && (
        <span className="flex shrink-0 gap-1">
          {lever.done > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => api.tick(lever.id, "untick")}
              aria-label={`Retirer une fois : ${lever.title}`}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-[#E2D8CC] bg-white text-base font-extrabold text-[#6B625B] disabled:opacity-50 lg:size-9"
            >
              −
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => api.tick(lever.id, "tick")}
            aria-label={`J’en ai fait un : ${lever.title}`}
            title="J’en ai fait un"
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-[#1F1A16] text-base font-extrabold text-white disabled:opacity-50 lg:size-9"
          >
            +1
          </button>
        </span>
      )}
    </div>
  );
}
