"use client";

// A goal's levers (« Pour que ce soit inévitable »): what someone does every
// week, whatever happens. Shown in the goal's drawer (EvidenceDrawer) since
// /admin/objectifs merged into Accueil (2026-10-21). Everyone reads and ticks
// their own; the founder adds, edits and removes levers. The server checks it.

import gsap from "gsap";
import { useEffect, useId, useRef, useState } from "react";
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { GoalView, GoalsPayload, LeverView } from "@/lib/team-goals/server";
import { prefersReducedMotion } from "../ui";
import type { GoalsApi } from "./useGoals";

type LeverDeps = { people: GoalsPayload["people"]; api: GoalsApi; busy: Record<string, boolean>; canManage: boolean };

/** The levers block of a goal, with the founder's add and edit actions. */
export function GoalLevers({ goal, deps }: { goal: GoalView; deps: LeverDeps }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = listRef.current;
    if (!root || prefersReducedMotion()) return;
    const rows = root.querySelectorAll("[data-lever]");
    if (!rows.length) return;
    const tween = gsap.fromTo(rows, { x: 12, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.3, ease: "power3.out", stagger: 0.04, clearProps: "transform,opacity,visibility" });
    return () => {
      tween.kill();
    };
  }, [goal.id]);

  return (
    <section aria-label="Leviers" className="mx-4 mt-4 overflow-hidden rounded-2xl border border-[#EFE6DA] bg-white lg:mx-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#F0E8DD] bg-[#FBF7F1] px-3.5 py-3">
        <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">Pour que ce soit inévitable</span>
        <span className="text-xs text-[#6B625B]">Les leviers : ce qu’on fait chaque semaine, quoi qu’il arrive.</span>
      </div>
      <div ref={listRef}>
        {goal.levers.length === 0 && (
          <p className="m-0 px-3.5 py-3 text-sm text-[#6B625B]">
            {deps.canManage ? "Aucun levier pour l’instant. Qu’est-ce qu’on fait chaque semaine pour celui-ci ?" : "Aucun levier pour l’instant."}
          </p>
        )}
        {goal.levers.map((lever) => (
          <LeverRow key={lever.id} lever={lever} deps={deps} />
        ))}
      </div>
      {deps.canManage && <LeverComposer goal={goal} deps={deps} />}
    </section>
  );
}

function LeverRow({ lever, deps }: { lever: LeverView; deps: LeverDeps }) {
  const [editing, setEditing] = useState(false);
  const pct = Math.max(Math.round((Math.min(lever.done, lever.weeklyTarget) / lever.weeklyTarget) * 100), 3);
  if (editing) {
    return (
      <LeverForm
        people={deps.people}
        initial={{ ownerId: lever.ownerId, title: lever.title, rhythm: lever.rhythm ?? "", weeklyTarget: String(lever.weeklyTarget) }}
        busy={!!deps.busy[`lever:${lever.id}`]}
        submitLabel="Enregistrer"
        onCancel={() => setEditing(false)}
        onSubmit={async (value) => {
          const ok = await deps.api.editLever(lever.id, value);
          if (ok) setEditing(false);
        }}
        onArchive={async () => {
          const ok = await deps.api.archiveLever(lever.id);
          if (ok) setEditing(false);
        }}
      />
    );
  }
  return (
    <div data-lever className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#F4EEE6] px-3.5 py-3 last:border-b-0", lever.mine && "bg-[#FDF6EF]")}>
      <span aria-hidden="true" className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white", lever.mine ? "bg-[#C96A2E]" : "bg-[#1F1A16]")}>
        {lever.ownerInitials}
      </span>
      <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-0.5">
        <span className="text-[15px] font-extrabold leading-snug [overflow-wrap:anywhere]">{lever.title}</span>
        <span className="text-[13px] text-[#6B625B]">{[lever.ownerName, lever.rhythm].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="flex min-w-[150px] flex-[0_1_200px] items-center gap-2.5">
        <span aria-hidden="true" className="block h-2 flex-1 overflow-hidden rounded-full bg-[#F0E8DD]">
          <span className={cn("block h-full rounded-full", lever.done >= lever.weeklyTarget ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} style={{ width: `${pct}%` }} />
        </span>
        <span className="whitespace-nowrap text-right text-[13px] font-extrabold text-[#4A4540]">
          {lever.done} / {lever.weeklyTarget} semaine
        </span>
      </div>
      {lever.mine && <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-[#F7E4D3] px-2.5 text-xs font-extrabold text-[#8A4924]">Ma part</span>}
      {lever.canTick && <LeverTicks lever={lever} api={deps.api} busy={!!deps.busy[`lever:${lever.id}`]} />}
      {deps.canManage && (
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

function LeverTicks({ lever, api, busy }: { lever: LeverView; api: GoalsApi; busy: boolean }) {
  return (
    <span className="flex gap-1">
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
      className="m-2.5 flex flex-col gap-2.5 rounded-2xl border border-[#EFE6DA] bg-[#FBF7F1] p-3"
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
              <option key={p.id} value={p.id}>
                {p.firstName} · {p.levelLabel}
              </option>
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
      {problem && (
        <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="h-11 rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white disabled:opacity-60">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="h-11 rounded-full border border-[#E2D8CC] bg-white px-4 text-sm font-bold">
          Annuler
        </button>
        {onArchive && (
          <>
            <span className="flex-1" />
            <button type="button" disabled={busy} onClick={onArchive} className="h-11 rounded-full bg-[#FBE3DF] px-4 text-sm font-extrabold text-[#8E2A1E] disabled:opacity-60">
              Retirer le levier
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function LeverComposer({ goal, deps }: { goal: GoalView; deps: LeverDeps }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [goal.id]);
  if (!open) {
    return (
      <div className="border-t border-[#F0E8DD] px-3.5 py-3">
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
      people={deps.people}
      initial={{ ownerId: "", title: "", rhythm: "", weeklyTarget: "1" }}
      busy={!!deps.busy[`levers:${goal.id}`]}
      submitLabel="Ajouter le levier"
      onCancel={() => setOpen(false)}
      onSubmit={async (value) => {
        const ok = await deps.api.addLever(goal.id, value);
        if (ok) setOpen(false);
      }}
    />
  );
}
