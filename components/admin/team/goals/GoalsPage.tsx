"use client";

// /admin/objectifs (Objectifs.dc.html on desktop, ObjectifsMobile.dc.html on
// the phone): the goals as cards, then the selected goal's levers, « Ma part »
// for the viewer, who keeps their levers this week, and how each number is
// counted. Opened from Accueil (« Voir les leviers »). Everyone reads; the
// founder adds goals and levers; the server checks it.

import Link from "next/link";
import gsap from "gsap";
import { useEffect, useId, useRef, useState } from "react";
import { LockSimpleIcon, PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { METRICS, PRINCIPLE, type GoalMetric } from "@/lib/team-goals/core";
import type { GoalView, GoalsPayload, LeverView } from "@/lib/team-goals/server";
import { CreamBackdrop, prefersReducedMotion, useEntrance } from "../ui";
import { GoalIcon, STATUS_CHIP, STATUS_FILL, TAB_BADGE } from "./GoalIcon";
import { GoalsOverlays, MyShare, UndoToast, useGoalsUi, type GoalsUi } from "./GoalsStrip";

export function GoalsPage({ initial, initialGoalId, founderName }: { initial: GoalsPayload; initialGoalId: string | null; founderName: string }) {
  const ui = useGoalsUi(initial);
  const { data } = ui;
  const [selectedId, setSelectedId] = useState<string | null>(initialGoalId);
  const selected = data.goals.find((g) => g.id === selectedId) ?? data.goals[0] ?? null;
  const rootRef = useRef<HTMLDivElement>(null);
  const leversRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const pick = (id: string) => {
    setSelectedId(id);
    // Phone: the levers are under the cards, so bring them into view.
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }));
    }
  };
  useEntrance(rootRef, "[data-anim]", []);

  useEffect(() => {
    const root = leversRef.current;
    if (!root || prefersReducedMotion()) return;
    const rows = root.querySelectorAll("[data-lever]");
    if (!rows.length) return;
    const tween = gsap.fromTo(rows, { x: 12, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.3, ease: "power3.out", stagger: 0.04, clearProps: "transform,opacity,visibility" });
    return () => {
      tween.kill();
    };
  }, [selected?.id]);

  const years = [...new Set(data.goals.filter((g) => g.tab === "annee").map((g) => g.periodLabel))];
  const eyebrow = years.length === 1 && data.goals.every((g) => g.tab === "annee")
    ? `Chaque objectif a sa période · ici, les objectifs de l’${years[0].replace("Année", "année")}`
    : "Chaque objectif a sa période";
  const intro = data.canManage
    ? `${countWord(data.goals.length)}. Toute l’équipe les voit, avec les leviers de chacun.`
    : `Les objectifs que ${founderName} a fixés pour l’équipe. Vos leviers sont marqués « Ma part ».`;

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 pb-28 text-[#1F1A16] lg:gap-5 lg:pb-0">
      <CreamBackdrop />
      <header data-anim className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-1.5">
          <Link href="/admin" className="mb-1 inline-flex min-h-11 items-center self-start text-sm font-extrabold text-[#8A4924] no-underline hover:text-[#5A321A] lg:min-h-0">
            ‹ Accueil
          </Link>
          <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924] lg:text-[13px]">{eyebrow}</span>
          <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.01em] lg:text-[34px]">Nos objectifs</h1>
          <p className="m-0 max-w-[760px] text-[15px] leading-[1.45] text-[#4A4540] lg:text-[17px]">{intro}</p>
        </div>
        {data.canManage && (
          <button
            type="button"
            onClick={() => ui.setAdding(true)}
            className="hidden h-12 cursor-pointer items-center gap-2 rounded-full bg-[#C96A2E] px-5 text-[15px] font-extrabold text-white hover:bg-[#8A4924] lg:inline-flex"
          >
            <PlusIcon size={18} weight="bold" aria-hidden="true" />
            Nouvel objectif
          </button>
        )}
      </header>

      <section data-anim aria-label="Notre principe" className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-[20px] bg-[#1F1A16] px-4 py-3.5 text-white lg:gap-y-3 lg:rounded-[24px] lg:px-6 lg:py-5">
        <span className="flex-none text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#E8A33D] lg:text-xs">Le principe Roogo</span>
        <span className="flex-[1_1_520px] text-[17px] font-extrabold leading-snug lg:text-[22px]">« {PRINCIPLE} »</span>
        <span className="hidden flex-[1_1_300px] text-sm leading-normal text-[#D9CFC4] lg:block">
          Chaque objectif a ses leviers : ce qu’on fait chaque semaine, quoi qu’il arrive.
        </span>
      </section>

      {!data.ready && (
        <p className="m-0 rounded-2xl border border-dashed border-[#D6CBBE] bg-white px-4 py-3 text-sm text-[#4A4540]" role="status">
          Nos objectifs ne sont pas encore installés (migration 091 à lancer).
        </p>
      )}
      <UndoToast ui={ui} />
      {ui.error && !ui.open && (
        <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">{ui.error}</p>
      )}

      <MyShare mine={data.mine} totals={data.mineTotals} api={ui.api} busy={ui.busy} className="lg:hidden" />

      {data.ready && data.goals.length === 0 && (
        <p className="m-0 rounded-2xl bg-white px-4 py-6 text-center text-sm font-bold text-[#6B625B]">
          {data.canManage ? "Aucun objectif pour l’instant. Ajoutez le premier." : "Aucun objectif pour l’instant."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
        {data.goals.map((goal) => (
          <GoalTile key={goal.id} goal={goal} selected={goal.id === selected?.id} onPick={() => pick(goal.id)} />
        ))}
      </div>

      {selected && (
        <div ref={detailRef} className="flex scroll-mt-24 flex-wrap items-start gap-5">
          <main className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[20px] border border-[#EAE1D5] bg-white lg:rounded-[24px]">
            <div className="flex flex-wrap items-start gap-x-5 gap-y-3 border-b border-[#F0E8DD] px-4 py-4 lg:px-6 lg:py-5">
              <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
                <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">Pour que ce soit inévitable</span>
                <h2 className="m-0 text-[22px] font-extrabold lg:text-2xl">{selected.title}</h2>
                <span className="text-sm leading-[1.45] text-[#6B625B]">{selected.measure}</span>
              </div>
              <div className="grid flex-[0_1_300px] grid-cols-2 gap-2">
                <Stat label="Il reste" value={selected.remainingLabel} />
                <Stat label="Rythme à tenir" value={selected.need} />
              </div>
            </div>

            <div ref={leversRef} className="py-2">
              {selected.levers.length === 0 && (
                <p className="m-0 px-4 py-4 text-sm text-[#6B625B] lg:px-6">
                  {data.canManage ? "Aucun levier pour l’instant. Qu’est-ce qu’on fait chaque semaine pour celui-ci ?" : "Aucun levier pour l’instant."}
                </p>
              )}
              {selected.levers.map((lever) => (
                <LeverRow key={lever.id} lever={lever} ui={ui} canManage={data.canManage} />
              ))}
            </div>

            {data.canManage && <LeverComposer goal={selected} ui={ui} />}
            <div className="flex flex-wrap gap-2 border-t border-[#F0E8DD] px-4 pb-5 pt-4 lg:px-6">
              <button
                type="button"
                onClick={() => ui.setOpenId(selected.id)}
                className="h-11 cursor-pointer rounded-full border border-[#E2D8CC] bg-white px-4 text-sm font-bold hover:border-[#C96A2E]"
              >
                {selected.manual && data.canEnterReading ? "Saisir le chiffre du jour" : "Voir les preuves"}
              </button>
              {data.canManage && (
                <button
                  type="button"
                  onClick={() => ui.setOpenId(selected.id)}
                  className="h-11 cursor-pointer rounded-full bg-transparent px-4 text-sm font-bold text-[#6B625B]"
                >
                  Modifier l’objectif
                </button>
              )}
            </div>
          </main>

          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
            <MyShare mine={data.mine} totals={data.mineTotals} api={ui.api} busy={ui.busy} className="hidden lg:flex" />
            {data.tally.length > 0 && (
              <section aria-labelledby="leviers-tenus" className="flex flex-col gap-2.5 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
                <h2 id="leviers-tenus" className="m-0 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Leviers tenus cette semaine</h2>
                {data.tally.map((person) => {
                  const pct = person.target ? Math.round((person.done / person.target) * 100) : 0;
                  return (
                    <div key={person.personId} className="flex items-center gap-3">
                      <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1F1A16] text-[11px] font-extrabold text-white">{person.initials}</span>
                      <span className="w-[84px] truncate text-sm font-extrabold">{person.name}</span>
                      <span aria-hidden="true" className="block h-2 flex-1 overflow-hidden rounded-full bg-[#F0E8DD]">
                        <span className={cn("block h-full rounded-full", pct >= 80 ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} style={{ width: `${Math.max(pct, 3)}%` }} />
                      </span>
                      <span className="w-16 text-right text-[13px] font-bold text-[#4A4540]">{person.done} / {person.target}</span>
                    </div>
                  );
                })}
                <span className="text-xs leading-snug text-[#6B625B]">Chaque levier compte au plus sa cible de la semaine.</span>
              </section>
            )}
            <section aria-labelledby="comment-compte" className="flex flex-col gap-2 rounded-[20px] border border-[#EFE6DA] bg-[#FBF7F1] p-4">
              <h2 id="comment-compte" className="m-0 text-sm font-extrabold">Comment c’est compté</h2>
              {[...new Set(data.goals.map((g) => g.metric))].map((metric) => (
                <p key={metric} className="m-0 text-[13px] leading-normal text-[#4A4540]">
                  <strong>{METRICS[metric as GoalMetric].family} :</strong> {METRICS[metric as GoalMetric].measure}
                </p>
              ))}
            </section>
            <section aria-label="Visible par" className="flex items-center gap-2.5 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
              <LockSimpleIcon size={18} aria-hidden="true" className="shrink-0 text-[#6B625B]" />
              <span className="text-[13px] leading-snug text-[#4A4540]">Visible par toute l’équipe. Seul {founderName} crée et modifie les objectifs.</span>
            </section>
          </aside>
        </div>
      )}

      {data.canManage && (
        <div className="fixed inset-x-4 bottom-6 z-40 lg:hidden">
          <button
            type="button"
            onClick={() => ui.setAdding(true)}
            className="h-[54px] w-full cursor-pointer rounded-full bg-[#C96A2E] text-base font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(201,106,46,0.8)]"
          >
            Nouvel objectif
          </button>
        </div>
      )}
      <GoalsOverlays ui={ui} />
    </div>
  );
}

function countWord(n: number) {
  const words = ["Aucun objectif", "Un objectif", "Deux objectifs", "Trois objectifs", "Quatre objectifs", "Cinq objectifs", "Six objectifs", "Sept objectifs", "Huit objectifs", "Neuf objectifs", "Dix objectifs"];
  return words[n] ?? `${n} objectifs`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-[#FBF7F1] px-3 py-2.5">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">{label}</span>
      <span className="text-base font-extrabold leading-tight lg:text-lg">{value}</span>
    </div>
  );
}

function GoalTile({ goal, selected, onPick }: { goal: GoalView; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      data-anim
      aria-pressed={selected}
      onClick={onPick}
      className={cn(
        "flex cursor-pointer flex-col items-start gap-2 rounded-[20px] border-0 bg-white p-4 text-left text-[#1F1A16] transition-[box-shadow,transform] duration-200",
        selected ? "-translate-y-0.5 shadow-[inset_0_0_0_2px_#C96A2E,0_14px_30px_-18px_rgba(31,26,22,0.5)]" : "shadow-[inset_0_0_0_1px_#EAE1D5]",
      )}
    >
      <span className="flex w-full items-center gap-2">
        <GoalIcon kind={goal.icon} size={28} />
        <span className="flex-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">{goal.family}</span>
        <span className={cn("inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-extrabold", STATUS_CHIP[goal.tone])}>{goal.statusLabel}</span>
      </span>
      <span className="text-base font-extrabold leading-tight lg:text-lg">{goal.title}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.02em] lg:text-[34px]">{goal.currentLabel}</span>
        <span className="text-[15px] font-bold text-[#6B625B]">/ {goal.targetLabel}</span>
      </span>
      <span aria-hidden="true" className="block h-2.5 w-full overflow-hidden rounded-full bg-[#EFE6DA]">
        <span className={cn("block h-full rounded-full", STATUS_FILL[goal.tone])} style={{ width: `${Math.max(goal.pct, 2)}%` }} />
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={cn("inline-flex h-5 items-center rounded-md px-[7px] text-[10px] font-extrabold", TAB_BADGE[goal.tab])}>{goal.periodLabel}</span>
        <span className="text-[11px] font-bold text-[#6B625B]">{goal.countdown}</span>
      </span>
      <span className="text-[13px] leading-snug text-[#4A4540]">{goal.paceText}</span>
    </button>
  );
}

function LeverRow({ lever, ui, canManage }: { lever: LeverView; ui: GoalsUi; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const pct = Math.max(Math.round((Math.min(lever.done, lever.weeklyTarget) / lever.weeklyTarget) * 100), 3);
  if (editing) {
    return (
      <LeverForm
        people={ui.data.people}
        initial={{ ownerId: lever.ownerId, title: lever.title, rhythm: lever.rhythm ?? "", weeklyTarget: String(lever.weeklyTarget) }}
        busy={!!ui.busy[`lever:${lever.id}`]}
        submitLabel="Enregistrer"
        onCancel={() => setEditing(false)}
        onSubmit={async (value) => {
          const ok = await ui.api.editLever(lever.id, value);
          if (ok) setEditing(false);
        }}
        onArchive={async () => {
          const ok = await ui.api.archiveLever(lever.id);
          if (ok) setEditing(false);
        }}
      />
    );
  }
  return (
    <div data-lever className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3.5 lg:px-6", lever.mine && "bg-[#FDF6EF]")}>
      <span aria-hidden="true" className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white", lever.mine ? "bg-[#C96A2E]" : "bg-[#1F1A16]")}>
        {lever.ownerInitials}
      </span>
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
        <span className="text-base font-extrabold leading-snug [overflow-wrap:anywhere]">{lever.title}</span>
        <span className="text-[13px] text-[#6B625B]">{[lever.ownerName, lever.rhythm].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="flex min-w-[160px] flex-[0_1_220px] items-center gap-2.5">
        <span aria-hidden="true" className="block h-2 flex-1 overflow-hidden rounded-full bg-[#F0E8DD]">
          <span className={cn("block h-full rounded-full", lever.done >= lever.weeklyTarget ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} style={{ width: `${pct}%` }} />
        </span>
        <span className="w-[92px] text-right text-[13px] font-extrabold text-[#4A4540]">{lever.done} / {lever.weeklyTarget} semaine</span>
      </div>
      {lever.mine && (
        <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-[#F7E4D3] px-2.5 text-xs font-extrabold text-[#8A4924]">Ma part</span>
      )}
      {lever.canTick && <LeverTickRowCompact lever={lever} ui={ui} />}
      {canManage && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Modifier le levier : ${lever.title}`}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-[#E2D8CC] bg-white text-[#6B625B] lg:size-9"
        >
          <PencilSimpleIcon size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function LeverTickRowCompact({ lever, ui }: { lever: LeverView; ui: GoalsUi }) {
  const busy = !!ui.busy[`lever:${lever.id}`];
  return (
    <span className="flex gap-1">
      {lever.done > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => ui.api.tick(lever.id, "untick")}
          aria-label={`Retirer une fois : ${lever.title}`}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-[#E2D8CC] bg-white text-base font-extrabold text-[#6B625B] disabled:opacity-50 lg:size-9"
        >
          −
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => ui.api.tick(lever.id, "tick")}
        aria-label={`J’en ai fait un : ${lever.title}`}
        title="J’en ai fait un"
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-[#1F1A16] text-base font-extrabold text-white disabled:opacity-50 lg:size-9"
      >
        +1
      </button>
    </span>
  );
}

type LeverValue = { ownerId: string; title: string; rhythm: string; weeklyTarget: number };

function LeverForm({
  people,
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
  onArchive,
}: {
  people: GoalsPayload["people"];
  initial: { ownerId: string; title: string; rhythm: string; weeklyTarget: string };
  busy: boolean;
  submitLabel: string;
  onSubmit: (value: LeverValue) => void;
  onCancel: () => void;
  onArchive?: () => void;
}) {
  const id = useId();
  const [ownerId, setOwnerId] = useState(initial.ownerId);
  const [title, setTitle] = useState(initial.title);
  const [rhythm, setRhythm] = useState(initial.rhythm);
  const [weekly, setWeekly] = useState(initial.weeklyTarget);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="mx-4 my-2 flex flex-col gap-2.5 rounded-2xl border border-[#EFE6DA] bg-[#FBF7F1] p-3 lg:mx-6"
      onSubmit={(event) => {
        event.preventDefault();
        setProblem(null);
        const n = Number(weekly);
        if (!ownerId) return setProblem("Choisissez qui tient ce levier.");
        if (!title.trim()) return setProblem("Écrivez ce qu’on fait chaque semaine.");
        if (!Number.isInteger(n) || n < 1 || n > 100) return setProblem("Combien de fois par semaine : de 1 à 100.");
        onSubmit({ ownerId, title: title.trim(), rhythm: rhythm.trim(), weeklyTarget: n });
      }}
    >
      <label htmlFor={`${id}-t`} className="flex flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
        Ce qu’on fait chaque semaine
        <input id={`${id}-t`} autoFocus value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-[15px] font-bold text-[#1F1A16]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-o`} className="flex min-w-0 flex-[1_1_140px] flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
          Qui
          <select id={`${id}-o`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-2 text-sm font-bold text-[#1F1A16]">
            <option value="">Choisir…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.firstName} · {p.levelLabel}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-r`} className="flex min-w-0 flex-[2_1_160px] flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
          Rythme
          <input id={`${id}-r`} value={rhythm} maxLength={80} placeholder="Chaque semaine" onChange={(e) => setRhythm(e.target.value)} className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-sm text-[#1F1A16]" />
        </label>
        <label htmlFor={`${id}-w`} className="flex w-28 flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
          Par semaine
          <input id={`${id}-w`} inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value.replace(/\D/g, "").slice(0, 3))} className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-[15px] font-bold text-[#1F1A16]" />
        </label>
      </div>
      {problem && <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="h-11 rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white disabled:opacity-60">{submitLabel}</button>
        <button type="button" onClick={onCancel} className="h-11 rounded-full border border-[#E2D8CC] bg-white px-4 text-sm font-bold">Annuler</button>
        {onArchive && (
          <>
            <span className="flex-1" />
            <button type="button" disabled={busy} onClick={onArchive} className="h-11 rounded-full bg-[#FBE3DF] px-4 text-sm font-extrabold text-[#8E2A1E] disabled:opacity-60">Retirer le levier</button>
          </>
        )}
      </div>
    </form>
  );
}

function LeverComposer({ goal, ui }: { goal: GoalView; ui: GoalsUi }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [goal.id]);
  if (!open) {
    return (
      <div className="px-4 pb-1 pt-2 lg:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[#1F1A16] px-[18px] text-sm font-extrabold text-white"
        >
          <PlusIcon size={16} weight="bold" aria-hidden="true" />
          Ajouter un levier
        </button>
      </div>
    );
  }
  return (
    <LeverForm
      people={ui.data.people}
      initial={{ ownerId: "", title: "", rhythm: "", weeklyTarget: "1" }}
      busy={!!ui.busy[`levers:${goal.id}`]}
      submitLabel="Ajouter le levier"
      onCancel={() => setOpen(false)}
      onSubmit={async (value) => {
        const ok = await ui.api.addLever(goal.id, value);
        if (ok) setOpen(false);
      }}
    />
  );
}

