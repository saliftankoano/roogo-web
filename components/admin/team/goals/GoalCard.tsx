"use client";

// One goal as a card (the former /admin/objectifs card, now on Accueil):
// family label with its logo, status pill, title, big number / target,
// progress bar, period chip and countdown, and the one-line explanation
// (« Il en faut 6 par jour. »). Clicking opens the goal's drawer.
// Founder only, once reached (or once its period ended): « Prochaine marche »
// with « Lancer » and « Ajuster » under the card.

import { cn } from "@/lib/utils";
import type { GoalView } from "@/lib/team-goals/server";
import { GoalIcon, STATUS_CHIP, STATUS_FILL, TAB_BADGE } from "./GoalIcon";

export function GoalCard({
  goal,
  onOpen,
  onLaunch,
  onAdjust,
  busy = false,
  className,
}: {
  goal: GoalView;
  onOpen: () => void;
  onLaunch?: () => void;
  onAdjust?: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[20px] bg-white text-[#1F1A16] shadow-[inset_0_0_0_1px_#EAE1D5] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_2px_#C96A2E,0_14px_30px_-18px_rgba(31,26,22,0.5)]",
        className,
      )}
    >
      <button
        type="button"
        data-goal={goal.id}
        onClick={onOpen}
        aria-label={`${goal.title}, ${goal.currentLabel} sur ${goal.targetLabel}, ${goal.statusLabel}. Voir le détail`}
        className="flex flex-1 cursor-pointer flex-col items-start gap-2 rounded-[20px] border-0 bg-transparent p-4 text-left text-[#1F1A16]"
      >
        <span className="flex w-full items-center gap-2">
          <GoalIcon kind={goal.icon} size={28} />
          <span className="min-w-0 flex-1 truncate text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">{goal.family}</span>
          <span className={cn("inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-extrabold", STATUS_CHIP[goal.tone])}>{goal.statusLabel}</span>
        </span>
        <span className="text-base font-extrabold leading-tight lg:text-lg">{goal.title}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[28px] font-extrabold leading-none tracking-[-0.02em] lg:text-[34px]">{goal.currentLabel}</span>
          <span className="text-[15px] font-bold text-[#6B625B]">/ {goal.targetLabel}</span>
        </span>
        <span aria-hidden="true" className="block h-2.5 w-full overflow-hidden rounded-full bg-[#EFE6DA]">
          <span data-gfill className={cn("block h-full origin-left rounded-full", STATUS_FILL[goal.tone])} style={{ width: `${Math.max(goal.pct, 2)}%` }} />
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={cn("inline-flex h-5 items-center rounded-md px-[7px] text-[10px] font-extrabold", TAB_BADGE[goal.tab])}>{goal.periodLabel}</span>
          <span className="text-[11px] font-bold text-[#6B625B]">{goal.countdown}</span>
        </span>
        <span className="text-[13px] leading-snug text-[#4A4540]">{goal.paceText}</span>
      </button>
      {goal.nextStep && onLaunch && onAdjust && (
        <div className="flex flex-col gap-2 border-t border-[#F0E8DD] px-4 pb-4 pt-3">
          <p className="m-0 text-[13px] leading-snug text-[#4A4540]">
            <strong className="font-extrabold text-[#1F1A16]">Prochaine marche : </strong>
            {goal.nextStep.title} {goal.nextStep.endPhrase}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onLaunch}
              className="h-10 cursor-pointer rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {busy ? "Lancement…" : "Lancer"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onAdjust}
              className="h-10 cursor-pointer rounded-full border border-[#E2D8CC] bg-white px-4 text-sm font-bold disabled:opacity-60"
            >
              Ajuster
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
