"use client";

import { useState } from "react";
import {
  ChatsCircleIcon,
  CheckCircleIcon,
  GearSixIcon,
  LockSimpleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ArtifactCard, type CardProps } from "./ArtifactsPanel";
import type { VoiceInfo } from "./VoicePicker";
import type { Artifact } from "./studio-types";

type Props = {
  artifacts: Artifact[];
  voices: VoiceInfo[];
  voice: string;
  onVoice: (key: string) => void;
  canWrite: boolean;
  card: Omit<CardProps, "artifact">;
  onAskScript: () => void;
  onManage: () => void;
};

function initials(label: string) {
  const name = label.replace(/^Voix (de |d')/i, "");
  return name.slice(0, 1).toUpperCase();
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-bold",
          done ? "bg-primary text-white" : "border border-[rgba(74,52,36,0.18)] bg-white text-neutral-600",
        )}
        aria-hidden
      >
        {done ? <CheckCircleIcon size={18} weight="fill" className="size-[18px]" /> : n}
      </span>
      <div className="min-w-0 space-y-3">
        <h3 className="pt-1 text-[15px] font-semibold text-neutral-900">{title}</h3>
        {children}
      </div>
    </section>
  );
}

/**
 * Voice-over in three steps (Salif, 2026-10-10: "on audio I have no idea how to
 * begin"): pick the script, pick the voice, generate. Voice-overs already made
 * for this project sit underneath with their player and subtitles.
 */
export function VoiceStudio({ artifacts, voices, voice, onVoice, canWrite, card, onAskScript, onManage }: Props) {
  const scripts = artifacts
    .filter((a) => a.kind === "script")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const voiceovers = artifacts
    .filter((a) => a.kind === "voiceover")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [scriptId, setScriptId] = useState<string | null>(null);
  const script = scripts.find((s) => s.id === scriptId) ?? scripts[0] ?? null;
  const usable = voices.filter((v) => v.status === "active");
  const locked = voices.filter((v) => v.status !== "active" && v.status !== "revoked");
  const versionOf = (a: Artifact) => scripts.length - scripts.findIndex((s) => s.id === a.id);

  return (
    <div className="mx-auto grid w-full max-w-[720px] gap-7 px-4 py-6 md:px-6">
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-neutral-900">Créer une voix off</h2>
        <p className="text-sm text-neutral-600">Choisissez le script, puis la voix, puis générez. Le prix s&apos;affiche avant de payer.</p>
      </header>

      <Step n={1} title="Le script à lire" done={!!script}>
        {scripts.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[rgba(74,52,36,0.2)] bg-white/50 p-4">
            <p className="min-w-0 flex-1 text-sm text-neutral-600">Ce projet n&apos;a pas encore de script. Roogo l&apos;écrit à partir de l&apos;annonce.</p>
            <button
              type="button"
              onClick={onAskScript}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white"
            >
              <ChatsCircleIcon size={16} weight="bold" className="size-4" />
              Écrire le script
            </button>
          </div>
        ) : (
          <div role="radiogroup" aria-label="Script" className="grid gap-2">
            {scripts.map((s) => {
              const active = s.id === script?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setScriptId(s.id)}
                  className={cn(
                    "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                    active ? "border-primary/40 bg-white shadow-[0_0_0_3px_rgba(201,106,46,0.10)]" : "border-[rgba(74,52,36,0.10)] bg-white/55 hover:bg-white",
                  )}
                >
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", active ? "bg-primary/10 text-[#b45a22]" : "bg-[#f3ebe2] text-neutral-600")}>
                    v{versionOf(s)}
                  </span>
                  <span className="line-clamp-2 text-sm text-neutral-700">{s.text}</span>
                </button>
              );
            })}
          </div>
        )}
      </Step>

      <Step n={2} title="La voix" done={usable.some((v) => v.key === voice)}>
        <div role="radiogroup" aria-label="Voix" className="grid gap-2 sm:grid-cols-2">
          {usable.map((v) => {
            const active = v.key === voice;
            return (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onVoice(v.key)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                  active ? "border-primary/40 bg-white shadow-[0_0_0_3px_rgba(201,106,46,0.10)]" : "border-[rgba(74,52,36,0.10)] bg-white/55 hover:bg-white",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    active ? "bg-primary text-white" : "bg-[#efe4d8] text-[#8a4924]",
                  )}
                >
                  {initials(v.label)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-900">{v.label}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {v.description ?? (v.kind === "system" ? "Voix Roogo par défaut" : "Voix clonée")}
                  </span>
                </span>
                {active && <CheckCircleIcon size={20} weight="fill" className="size-5 shrink-0 text-primary" />}
              </button>
            );
          })}
          {locked.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={onManage}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[rgba(74,52,36,0.18)] p-3 text-left text-neutral-500 hover:bg-white/60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                <LockSimpleIcon size={16} weight="bold" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{v.label}</span>
                <span className="block truncate text-xs">{v.status === "pending" ? "En préparation" : "Acceptation requise"}</span>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onManage}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-800"
        >
          <GearSixIcon size={14} weight="bold" className="size-3.5" />
          Gérer les voix (cloner, retirer la mienne)
        </button>
      </Step>

      <Step n={3} title="Vérifier le texte et générer" done={false}>
        {script && canWrite ? (
          <ArtifactCard artifact={script} {...card} />
        ) : (
          <p className="text-sm text-neutral-500">Choisissez d&apos;abord un script.</p>
        )}
      </Step>

      {voiceovers.length > 0 && (
        <section className="space-y-3 border-t border-[rgba(74,52,36,0.10)] pt-6">
          <h3 className="text-[15px] font-semibold text-neutral-900">Voix off de ce projet ({voiceovers.length})</h3>
          {voiceovers.map((v) => (
            <div key={v.id} id={`voice-${v.id}`}>
              <ArtifactCard artifact={v} {...card} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
