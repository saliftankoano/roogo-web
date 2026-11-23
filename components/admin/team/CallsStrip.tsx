"use client";

// Mon espace: « Appels aujourd’hui 12 / 20 » and « Nouvel appel 3D » (PRD
// « Objectif d’appels quotidien » 2.3, approved by Salif on 2026-11-22). Every
// logged call counts, follow-ups included. The bar fills as calls are saved.

import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { countLabel } from "@/lib/team-tasks/prospects";
import type { CallGoalsPayload } from "@/lib/team-tasks/prospects-server";
import { callApi, prefersReducedMotion, useTasksChanged } from "./ui";

export function useCallGoals() {
  const [data, setData] = useState<CallGoalsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const body = await callApi<{ goals: CallGoalsPayload }>("/api/admin/call-goals");
      setData(body.goals);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Les appels n’ont pas pu se charger.");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useTasksChanged(refresh);
  return { data, error, refresh };
}

export function CallsStrip({ data, onNew }: { data: CallGoalsPayload | null; onNew: () => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const me = data?.me;
  const goal = me?.goal ?? null;
  const pct = goal && me ? Math.min(100, Math.round((me.today / goal) * 100)) : 0;
  const reached = !!goal && !!me && me.today >= goal;

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || prefersReducedMotion()) return;
    gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power3.out", transformOrigin: "left center", clearProps: "transform" });
  }, [pct]);

  return (
    <section data-anim aria-label="Appels Visites 3D" className="flex flex-col gap-3 rounded-[20px] bg-white px-4 py-3.5 lg:flex-row lg:items-center lg:gap-5 lg:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Appels aujourd’hui</span>
          <span className="flex-1" />
          <span className={cn("text-[22px] font-extrabold tabular-nums leading-none", reached && "text-[#2F7A48]")} aria-live="polite">
            {me ? countLabel(me.today, goal) : "…"}
          </span>
        </div>
        {goal ? (
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[#E9DFD2]">
            <div ref={barRef} className={cn("h-full rounded-full", reached ? "bg-[#2F7A48]" : "bg-[#C96A2E]")} style={{ width: `${Math.max(pct, me?.today ? 3 : 0)}%` }} />
          </div>
        ) : null}
        <span className="text-xs text-[#6B625B]">
          {!data?.ready && data
            ? "Le journal des appels 3D n’est pas encore installé (migration 111 à lancer)."
            : goal && me
              ? reached
                ? `Objectif atteint. Cette semaine : ${countLabel(me.week, me.weekTarget)}.`
                : `Encore ${goal - me.today} ${goal - me.today > 1 ? "appels" : "appel"}. Cette semaine : ${countLabel(me.week, me.weekTarget)}.`
              : "Chaque appel noté compte, les rappels aussi."}
        </span>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#1F1A16] px-5 text-[15px] font-extrabold text-white transition-colors hover:bg-black lg:h-11 lg:text-sm"
      >
        <PhoneIcon size={16} weight="bold" aria-hidden="true" />
        Nouvel appel 3D
      </button>
    </section>
  );
}
