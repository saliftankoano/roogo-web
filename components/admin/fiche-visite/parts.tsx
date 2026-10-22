"use client";

// Small pieces of the field visit sheet: check rows, the save pill, the
// progress bar and the resume dialog. Colours follow the approved canvas
// (brand #C96A2E, clay #8A4924, cream #F6F1EA, ink #1F1A16).

import { useEffect, useRef } from "react";
import { CheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { hhmm } from "@/lib/field-visits/core";
import type { SaveState } from "./useFicheSync";
import { growSegment, popTick, pulse, riseIn } from "./motion";

export function Tick({ on, size = 28, label }: { on: boolean; size?: number; label?: string }) {
  return (
    <span
      data-tick
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[9px] text-[15px] font-extrabold transition-[background-color,box-shadow] duration-200",
        on ? "bg-[#2F7A48] text-white" : "bg-white text-[#8A4924] shadow-[inset_0_0_0_2px_#D6CBBE]",
      )}
    >
      {on ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="18" strokeDashoffset="0" />
        </svg>
      ) : (
        label
      )}
    </span>
  );
}

/** One checklist row: the whole row is the button, the tick time shows under it. */
export function CheckRow({
  id,
  title,
  detail,
  at,
  locked,
  disabled,
  onToggle,
}: {
  id: string;
  title: string;
  detail: string;
  at: string | undefined;
  locked?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const on = !!at;
  const ref = useRef<HTMLButtonElement>(null);
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current) popTick(ref.current?.querySelector("[data-tick]") ?? null);
    was.current = on;
  }, [on]);
  return (
    <button
      ref={ref}
      type="button"
      data-check={id}
      aria-pressed={on}
      disabled={locked || disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border bg-white p-3 text-left text-inherit transition-colors",
        on ? "border-[#CFE3D4]" : "border-[#EAE1D5] hover:border-[#D6CBBE]",
        locked ? "cursor-not-allowed opacity-55" : disabled ? "cursor-default" : "cursor-pointer",
      )}
    >
      <Tick on={on} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-extrabold leading-[1.35] lg:text-[15px]">{title}</span>
        <span className="text-xs leading-[1.4] text-[#6B625B] lg:text-[13px]">{detail}</span>
        {on && <span className="text-xs font-extrabold text-[#245C33]">Fait à {hhmm(at)}</span>}
      </span>
    </button>
  );
}

export function SavePill({ save }: { save: SaveState }) {
  const ref = useRef<HTMLSpanElement>(null);
  const was = useRef(save.kind);
  useEffect(() => {
    if (was.current === "saving" && save.kind === "saved" && ref.current) {
      pulse(ref.current);
    }
    was.current = save.kind;
  }, [save.kind]);
  const offline = save.kind === "offline";
  const error = save.kind === "error";
  const label =
    save.kind === "saving"
      ? "Enregistrement…"
      : offline
        ? "Hors connexion · gardé sur le téléphone"
        : error
          ? "Pas enregistré sur le serveur"
          : save.at
            ? `Enregistré à ${save.at}`
            : "Enregistré automatiquement";
  return (
    <span
      ref={ref}
      role="status"
      aria-live="polite"
      title={error ? save.message : undefined}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-extrabold transition-colors duration-300",
        offline ? "bg-[#FCEFD4] text-[#6E4300]" : error ? "bg-[#FBE3DF] text-[#8E2A1E]" : save.kind === "saving" ? "bg-[#EEEBE7] text-[#4A4540]" : "bg-[#E3F1E6] text-[#245C33]",
      )}
    >
      {offline || error ? (
        <WarningCircleIcon size={13} weight="bold" aria-hidden="true" />
      ) : save.kind === "saving" ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : (
        <CheckIcon size={12} weight="bold" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

export function ProgressBar({ step, count = 7 }: { step: number; count?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const was = useRef(step);
  useEffect(() => {
    if (step > was.current) growSegment(ref.current?.children[step] ?? null);
    was.current = step;
  }, [step]);
  return (
    <div ref={ref} aria-hidden="true" className="grid gap-1 lg:gap-1.5" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, k) => (
        <span
          key={k}
          className={cn(
            "h-1.5 rounded-full transition-colors duration-300",
            k < step ? "bg-[#2F7A48]" : k === step ? "bg-[#C96A2E]" : "bg-[#E2D8CC]",
          )}
        />
      ))}
    </div>
  );
}

/** "Fiche en cours retrouvée": a bottom sheet on the phone, a centred dialog on a computer. */
export function ResumeDialog({
  text,
  busy,
  error,
  onResume,
  onRestart,
}: {
  text: string;
  busy: boolean;
  error: string | null;
  onResume: () => void;
  onRestart: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    riseIn(ref.current);
    first.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center lg:items-center">
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(31,26,22,0.45)]" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiche-resume-title"
        aria-describedby="fiche-resume-text"
        className="relative flex w-full flex-col gap-3 rounded-t-[26px] bg-white px-4 pb-7 pt-3 shadow-[0_30px_60px_-20px_rgba(31,26,22,0.5)] lg:w-[460px] lg:rounded-[26px] lg:p-6"
      >
        <span aria-hidden="true" className="h-[5px] w-10 self-center rounded-full bg-[#E2D8CC] lg:hidden" />
        <h2 id="fiche-resume-title" className="m-0 text-xl font-extrabold">
          Fiche en cours retrouvée
        </h2>
        <p id="fiche-resume-text" className="m-0 text-sm leading-[1.45] text-[#4A4540]">
          {text}
        </p>
        {error && (
          <p role="alert" className="m-0 rounded-xl bg-[#FBE3DF] px-3 py-2 text-[13px] font-semibold text-[#8E2A1E]">
            {error}
          </p>
        )}
        <button
          ref={first}
          type="button"
          onClick={onResume}
          disabled={busy}
          className="h-[54px] cursor-pointer rounded-full bg-[#C96A2E] text-base font-extrabold text-white transition-colors hover:bg-[#8A4924] disabled:opacity-60"
        >
          Reprendre où j’en étais
        </button>
        <button
          type="button"
          onClick={onRestart}
          disabled={busy}
          className="h-12 cursor-pointer rounded-full border border-[#E2D8CC] bg-white text-sm font-bold disabled:opacity-60"
        >
          Recommencer une nouvelle fiche
        </button>
      </div>
    </div>
  );
}

export function Card({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("flex flex-col gap-2.5 rounded-[18px] border border-[#EAE1D5] bg-white p-3 lg:p-3.5", className)}>
      {children}
    </div>
  );
}
