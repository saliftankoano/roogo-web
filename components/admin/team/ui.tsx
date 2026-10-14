"use client";

// Small shared pieces for "Mon briefing" and "L'équipe": chips, avatars, the
// check button, the view switch and the GSAP helpers. Colours follow the
// approved canvas (brand #C96A2E, clay #8A4924, cream #F6F1EA, ink #1F1A16).

import Link from "next/link";
import gsap from "gsap";
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { TaskTone } from "@/lib/team-tasks/core";

import { TEAM_TASKS_CHANGED } from "./events";

export { TEAM_TASKS_CHANGED, announceTasksChanged } from "./events";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fades and lifts the matching children in, once per `deps` change. */
export function useEntrance(ref: RefObject<HTMLElement | null>, selector: string, deps: unknown[]) {
  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion()) return;
    const targets = root.querySelectorAll(selector);
    if (!targets.length) return;
    const tween = gsap.fromTo(
      targets,
      { y: 12, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.42, ease: "power3.out", stagger: 0.05, clearProps: "transform,opacity,visibility" },
    );
    return () => {
      tween.kill();
    };
  }, deps);
}

/** Draws the tick of a check button that just turned on. */
export function animateCheck(button: HTMLElement | null) {
  if (!button || prefersReducedMotion()) return;
  const path = button.querySelector("path");
  if (path) {
    gsap.fromTo(path, { strokeDashoffset: 18 }, { strokeDashoffset: 0, duration: 0.32, ease: "power2.out" });
  }
  gsap.fromTo(button, { scale: 0.985 }, { scale: 1, duration: 0.24, ease: "power2.out", clearProps: "transform" });
}

/** Opens a block from height 0, used for the past-week detail. */
export function animateOpen(element: HTMLElement | null) {
  if (!element || prefersReducedMotion()) return;
  gsap.fromTo(
    element,
    { height: 0, autoAlpha: 0 },
    { height: "auto", autoAlpha: 1, duration: 0.36, ease: "power3.out", clearProps: "height,opacity,visibility" },
  );
}

/** Slides a panel in after a tab switch. */
export function animatePanel(element: HTMLElement | null) {
  if (!element || prefersReducedMotion()) return;
  gsap.fromTo(element, { x: 10, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.26, ease: "power2.out", clearProps: "transform,opacity,visibility" });
}

const TONES: Record<TaskTone, string> = {
  blue: "bg-[#E1EFF8] text-[#1F5F80]",
  orange: "bg-[#F7E4D3] text-[#8A4924]",
  grey: "bg-[#EEEBE7] text-[#4A4540]",
  red: "bg-[#FBE3DF] text-[#8E2A1E]",
  dark: "bg-[#1F1A16] text-white",
  green: "bg-[#E3F1E6] text-[#245C33]",
};

export function Chip({ tone, children, className }: { tone: TaskTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-extrabold", TONES[tone], className)}>
      {children}
    </span>
  );
}

const FLAG_TONES = {
  red: "bg-[#FBE3DF] text-[#8E2A1E]",
  amber: "bg-[#FCEFD4] text-[#6E4300]",
  green: "bg-[#E3F1E6] text-[#245C33]",
} as const;

export function Flag({ tone, children }: { tone: keyof typeof FLAG_TONES; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-extrabold", FLAG_TONES[tone])}>
      {children}
    </span>
  );
}

export function Avatar({ initials, tone = "ink", size = 40 }: { initials: string; tone?: "ink" | "brand" | "clay" | "muted"; size?: number }) {
  const bg = { ink: "bg-[#1F1A16]", brand: "bg-[#C96A2E]", clay: "bg-[#8A4924]", muted: "bg-[#D6CBBE]" }[tone];
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white", bg)}
    >
      {initials}
    </span>
  );
}

export function SectionLabel({ children, className, as: Tag = "h2" }: { children: React.ReactNode; className?: string; as?: "h2" | "h3" | "span" }) {
  return (
    <Tag className={cn("m-0 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#6B625B]", className)}>
      {children}
    </Tag>
  );
}

/** Round check button: a 44px target around a 32px circle. */
export function CheckButton({
  done,
  busy,
  label,
  onToggle,
  size = 32,
}: {
  done: boolean;
  busy?: boolean;
  label: string;
  onToggle: (button: HTMLButtonElement) => void;
  size?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) animateCheck(ref.current?.firstElementChild as HTMLElement | null);
    wasDone.current = done;
  }, [done]);
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={done}
      aria-label={label}
      disabled={busy}
      onClick={(event) => onToggle(event.currentTarget)}
      className="-m-1.5 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full disabled:cursor-wait"
    >
      <span
        style={{ width: size, height: size }}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-colors duration-200",
          done ? "bg-[#2F7A48] text-white" : "border-2 border-[#D6CBBE] bg-white text-transparent hover:border-[#C96A2E]",
          busy && "opacity-60",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="18" strokeDashoffset="0" />
        </svg>
      </span>
    </button>
  );
}

/** Green tick used in "Fait cette semaine". */
export function DoneTick({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="mt-px inline-flex shrink-0 items-center justify-center rounded-full bg-[#2F7A48] text-white"
      data-done-tick
    >
      <svg width={size - 6} height={size - 6} viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function ViewSwitch({ active }: { active: "briefing" | "equipe" }) {
  const base = "inline-flex h-11 items-center rounded-full px-4 text-sm sm:h-9 sm:px-3.5";
  return (
    <nav aria-label="Vue" className="inline-flex gap-1 self-start rounded-full border border-[#EDE4D8] bg-white/70 p-1">
      <Link
        href="/admin"
        aria-current={active === "briefing" ? "page" : undefined}
        className={cn(base, active === "briefing" ? "bg-[#C96A2E]/12 font-bold text-[#A8521D]" : "font-semibold text-neutral-600 hover:text-neutral-900")}
      >
        Mon briefing
      </Link>
      <Link
        href="/admin/equipe"
        aria-current={active === "equipe" ? "page" : undefined}
        className={cn(base, active === "equipe" ? "bg-[#C96A2E]/12 font-bold text-[#A8521D]" : "font-semibold text-neutral-600 hover:text-neutral-900")}
      >
        L’équipe
      </Link>
    </nav>
  );
}

/** Page-scoped cream canvas behind the briefing and the board. */
export function CreamBackdrop() {
  return <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[#F6F1EA]" />;
}

/** "d’Ablassé", "de Moubarak". */
export function deName(name: string) {
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(name) ? `d’${name}` : `de ${name}`;
}

export type ApiError = { error?: string };

export async function callApi<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new Error(body.error || `Erreur ${response.status} sur ${input.split("?")[0]}`);
  }
  return body;
}

/** Calls `fn` whenever another part of the page changes tasks. */
export function useTasksChanged(fn: () => void) {
  const saved = useRef(fn);
  saved.current = fn;
  const handler = useCallback(() => saved.current(), []);
  useEffect(() => {
    window.addEventListener(TEAM_TASKS_CHANGED, handler);
    return () => window.removeEventListener(TEAM_TASKS_CHANGED, handler);
  }, [handler]);
}
