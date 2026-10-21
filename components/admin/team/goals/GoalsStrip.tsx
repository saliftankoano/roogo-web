"use client";

// « Nos objectifs » on Accueil. Since 2026-10-21 /admin/objectifs is merged
// in here (approved design): « Le principe Roogo » band under the greeting,
// the goals as cards (GoalCard) with period filters, the levers tally on the
// right, and each goal's levers in its drawer (EvidenceDrawer). The founder
// adds and removes goals and levers here; the server checks it.

import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { PRINCIPLE, type PeriodTab } from "@/lib/team-goals/core";
import type { GoalView, GoalsPayload, LeverView } from "@/lib/team-goals/server";
import { prefersReducedMotion } from "../ui";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { GoalForm } from "./GoalForm";
import { GoalCard } from "./GoalCard";
import { useGoals, type GoalsApi } from "./useGoals";

type Tab = "tous" | PeriodTab;
// Long label on desktop, short on the phone so the four tabs fit on one line.
const TABS: [Tab, string, string][] = [
  ["tous", "Tous", "Tous"],
  ["mois", "Ce mois", "Mois"],
  ["trimestre", "Ce trimestre", "Trimestre"],
  ["annee", "Cette année", "Année"],
];

export function useGoalsUi(initial: GoalsPayload) {
  const goals = useGoals(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // ?objectif=<id> (old /admin/objectifs links redirect here) opens that goal's drawer once.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("objectif");
    if (!id) return;
    setOpenId(id);
    url.searchParams.delete("objectif");
    window.history.replaceState(null, "", url.toString());
  }, []);
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

/**
 * « Le principe Roogo » band, right under the greeting on Accueil. The eyebrow
 * sits on its own line; the quote and (from lg) the side text share a wrapping
 * row, so the quote keeps one line at 1200 px and at most two at 1024 px.
 * Phone: eyebrow and quote only.
 */
export function PrincipleBand() {
  return (
    <section data-anim aria-label="Le principe Roogo" className="flex flex-col gap-2 rounded-[20px] bg-[#1F1A16] px-4 py-4 text-white lg:rounded-[24px] lg:px-8 lg:py-6">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#E9A23B] lg:text-xs">Le principe Roogo</span>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-2.5">
        <p className="m-0 min-w-0 max-w-full flex-auto text-[20px] font-extrabold leading-[1.2] [text-wrap:balance] lg:text-[clamp(22px,2.2vw,28px)]">« {PRINCIPLE} »</p>
        <p className="m-0 hidden min-w-0 flex-[0_1_340px] text-[15px] leading-normal text-[#D9CFC4] lg:block">
          Chaque objectif a ses leviers : ce qu’on fait chaque semaine, quoi qu’il arrive.
        </p>
      </div>
    </section>
  );
}

/** « Nos objectifs » on Accueil: period filters, goal cards (grid on desktop, snap row on the phone). */
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
    <section ref={rootRef} data-anim aria-labelledby="nos-objectifs" className="flex min-w-0 flex-col gap-3">
      {/* One wrapping row: title and sub-line (stacked), period filters, new goal. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="mr-auto flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-none">
          <h2 id="nos-objectifs" className="m-0 text-[22px] font-extrabold tracking-[-0.01em] lg:text-2xl">
            Nos objectifs
          </h2>
          <p className="m-0 text-sm text-[#4A4540]">Toute l’équipe les voit, avec les leviers de chacun.</p>
        </div>
        <div role="tablist" aria-label="Période" className="order-3 flex max-w-full sm:order-none gap-0.5 overflow-x-auto rounded-full bg-[#F4EEE6] p-[3px] [scrollbar-width:none] sm:gap-1">
          {TABS.map(([value, label, short]) => {
            const on = tab === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-extrabold sm:gap-1.5 sm:pl-3 sm:pr-2.5 lg:h-8",
                  on ? "bg-white text-[#C96A2E] shadow-[0_1px_3px_rgba(31,26,22,0.12)]" : "text-[#6B625B]",
                )}
              >
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
                <span className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[10px]", on ? "bg-[#C96A2E] text-white" : "bg-[#E9DFD2] text-[#6B625B]")}>
                  {counts[value]}
                </span>
              </button>
            );
          })}
        </div>
        {data.canManage && (
          <button
            type="button"
            onClick={() => ui.setAdding(true)}
            aria-label="Nouvel objectif"
            className="order-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#C96A2E] sm:order-none text-[15px] font-extrabold text-white hover:bg-[#8A4924] sm:h-11 sm:w-auto sm:px-5"
          >
            <PlusIcon size={18} weight="bold" aria-hidden="true" />
            <span className="hidden sm:inline">Nouvel objectif</span>
          </button>
        )}
      </div>

      {/* Phone: a snap row of ~280 px cards. Desktop: a grid. */}
      <div role="tabpanel" className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:overflow-visible md:px-0 md:pb-0">
        {shown.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onOpen={() => ui.setOpenId(goal.id)} className="w-[280px] shrink-0 snap-start md:w-auto" />
        ))}
        {shown.length === 0 && (
          <div className="flex min-h-[140px] w-full items-center justify-center rounded-[20px] bg-white p-4 text-center text-[13px] font-bold text-[#6B625B] shadow-[inset_0_0_0_1px_#EAE1D5]">
            {emptyText}
          </div>
        )}
      </div>

      <UndoToast ui={ui} />
      {ui.error && !ui.open && (
        <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-3 py-2 text-sm font-semibold text-[#8E2A1E]">
          {ui.error}
        </p>
      )}
      {data.failedMetrics.length > 0 && (
        <p className="m-0 text-xs font-bold text-[#6E4300]" role="status">
          Un chiffre n’a pas pu se charger. Rechargez la page dans un instant.
        </p>
      )}

      {/* Phone: my share, under the goals. */}
      <MySharePhone mine={data.mine} totals={data.mineTotals} />
    </section>
  );
}

/** « Leviers tenus cette semaine »: each person's ticks against their weekly targets (alphabetical). */
export function LeversTally({ tally, className }: { tally: GoalsPayload["tally"]; className?: string }) {
  if (!tally.length) return null;
  const sorted = [...tally].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return (
    <section aria-label="Leviers tenus cette semaine" className={cn("flex flex-col gap-2.5 rounded-[20px] border border-[#EAE1D5] bg-white p-4", className)}>
      <h2 className="m-0 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Leviers tenus cette semaine</h2>
      {sorted.map((person) => {
        const pct = person.target ? Math.round((person.done / person.target) * 100) : 0;
        return (
          <div key={person.personId} className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1F1A16] text-[11px] font-extrabold text-white">
              {person.initials}
            </span>
            <span className="w-[84px] truncate text-sm font-extrabold">{person.name}</span>
            <span aria-hidden="true" className="block h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#F0E8DD]">
              <span className={cn("block h-full rounded-full", pct >= 80 ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} style={{ width: `${Math.max(pct, 3)}%` }} />
            </span>
            <span className="w-16 shrink-0 text-right text-[13px] font-bold text-[#4A4540]">
              {person.done} / {person.target}
            </span>
          </div>
        );
      })}
      <span className="text-xs leading-snug text-[#6B625B]">Chaque levier compte au plus sa cible de la semaine.</span>
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

/** « Ma part cette semaine » (desktop aside on Accueil). */
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
