"use client";

import { useEffect, useState } from "react";
import {
  ArrowsClockwiseIcon,
  CopyIcon,
  DownloadSimpleIcon,
  MicrophoneIcon,
  PushPinIcon,
  PushPinSlashIcon,
  SpinnerGapIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatMoney, type StudioCurrency } from "@/lib/studio/currency";
import type { Artifact, Estimate } from "./studio-types";

type CommonProps = {
  voiceKey: string;
  voiceLabel: string;
  currency: StudioCurrency;
  glossaryVersion: number;
  conversationId: string;
  onChanged: () => void;
  onRework: (artifact: Artifact) => void;
  onRates: (rate: number) => void;
};

type PanelProps = CommonProps & { artifacts: Artifact[] };

async function patchArtifact(id: string, pinned: boolean) {
  await fetch(`/api/admin/studio/artifacts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
}

async function deleteArtifact(id: string) {
  await fetch(`/api/admin/studio/artifacts/${id}`, { method: "DELETE" });
}

function ScriptCard({
  artifact,
  voiceKey,
  voiceLabel,
  currency,
  glossaryVersion,
  conversationId,
  onChanged,
  onRework,
  onRates,
}: CommonProps & { artifact: Artifact }) {
  const [text, setText] = useState(artifact.text);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Live price for this script in the chosen voice.
  useEffect(() => {
    if (!text.trim()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/studio/voiceover/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voiceKey }),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Estimate;
        setEstimate(data);
        onRates(data.fcfaPerUsd);
      } catch {
        // The server re-checks the price at generation time anyway.
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, voiceKey, glossaryVersion, onRates]);

  const money = (usd: number) =>
    formatMoney(usd, currency, estimate?.fcfaPerUsd ?? 600);
  const overBudget = estimate ? estimate.estimateUsd > estimate.remainingUsd : false;
  const canGenerate = !!estimate && !generating && !estimate.tooLong && !overBudget;

  async function generate() {
    if (!estimate) return;
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/studio/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: voiceKey,
          acknowledged_cost_usd: estimate.estimateUsd,
          conversation_id: conversationId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && typeof data.estimateUsd === "number") {
        setEstimate({ ...estimate, estimateUsd: data.estimateUsd });
        setMessage("Le prix a changé. Vérifiez-le puis relancez.");
        return;
      }
      if (!res.ok) {
        setMessage(data.error ?? "La voix n'a pas pu être générée.");
        return;
      }
      onChanged();
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage("Copie impossible sur cet appareil.");
    }
  }

  return (
    <article className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          {artifact.title}
        </h3>
        <CardActions artifact={artifact} onChanged={onChanged} />
      </header>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Texte du script"
        className="min-h-40 w-full resize-y rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base leading-relaxed text-neutral-900 outline-none focus:border-primary"
      />
      <p className="text-sm font-medium text-neutral-500" aria-live="polite">
        {estimate
          ? estimate.tooLong
            ? `Trop long : ${estimate.spokenCharacters} caractères pour ${estimate.maxCharacters} au maximum.`
            : `${estimate.spokenCharacters} caractères, environ ${money(estimate.estimateUsd)}. Reste ce mois : ${money(estimate.remainingUsd)}.`
          : "Le prix apparaît dans un instant."}
      </p>
      {overBudget && (
        <p className="text-sm font-bold text-red-600">
          Plafond mensuel atteint. Demandez à Salif de le relever.
        </p>
      )}
      <button
        type="button"
        onClick={generate}
        disabled={!canGenerate}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.985] disabled:opacity-40"
      >
        {generating ? (
          <SpinnerGapIcon size={20} className="animate-spin" />
        ) : (
          <MicrophoneIcon size={20} weight="bold" />
        )}
        {estimate
          ? `Générer la voix, ${voiceLabel} (environ ${money(estimate.estimateUsd)})`
          : "Générer la voix"}
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-100 text-sm font-bold text-neutral-700"
        >
          <CopyIcon size={16} weight="bold" />
          {copied ? "Copié" : "Copier"}
        </button>
        <button
          type="button"
          onClick={() => onRework({ ...artifact, text })}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-100 text-sm font-bold text-neutral-700"
        >
          <ArrowsClockwiseIcon size={16} weight="bold" />
          Réutiliser
        </button>
      </div>
      {message && (
        <p className="text-sm font-bold text-red-600" role="alert">
          {message}
        </p>
      )}
    </article>
  );
}

function CardActions({
  artifact,
  onChanged,
}: {
  artifact: Artifact;
  onChanged: () => void;
}) {
  return (
    <span className="flex gap-1">
      <button
        type="button"
        aria-label={artifact.pinned ? "Désépingler" : "Épingler"}
        onClick={async () => {
          await patchArtifact(artifact.id, !artifact.pinned);
          onChanged();
        }}
        className={cn(
          "flex size-11 items-center justify-center rounded-xl",
          artifact.pinned ? "bg-primary/10 text-primary" : "bg-neutral-100 text-neutral-500",
        )}
      >
        {artifact.pinned ? (
          <PushPinIcon size={18} weight="fill" />
        ) : (
          <PushPinSlashIcon size={18} weight="bold" />
        )}
      </button>
      <button
        type="button"
        aria-label="Supprimer"
        onClick={async () => {
          await deleteArtifact(artifact.id);
          onChanged();
        }}
        className="flex size-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500"
      >
        <TrashIcon size={18} weight="bold" />
      </button>
    </span>
  );
}

function VoiceCard({
  artifact,
  onChanged,
  onRework,
}: {
  artifact: Artifact;
  onChanged: () => void;
  onRework: (artifact: Artifact) => void;
}) {
  return (
    <article className="space-y-3 rounded-3xl border border-primary/30 bg-primary/5 p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
          {artifact.title}
        </h3>
        <CardActions artifact={artifact} onChanged={onChanged} />
      </header>
      {artifact.url ? (
        <audio controls src={artifact.url} className="w-full" />
      ) : (
        <p className="text-sm font-medium text-neutral-500">
          L&apos;audio n&apos;est plus disponible.
        </p>
      )}
      <p className="line-clamp-3 text-sm font-medium text-neutral-600">
        {artifact.text}
      </p>
      <div className="flex gap-2">
        {artifact.downloadUrl && (
          <a
            href={artifact.downloadUrl}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-primary"
          >
            <DownloadSimpleIcon size={16} weight="bold" />
            Télécharger
          </a>
        )}
        <button
          type="button"
          onClick={() => onRework(artifact)}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-neutral-700"
        >
          <ArrowsClockwiseIcon size={16} weight="bold" />
          Réutiliser le texte
        </button>
      </div>
    </article>
  );
}

export function ArtifactsPanel({ artifacts, ...common }: PanelProps) {
  // Pinned first, then newest first.
  const ordered = [...artifacts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  if (ordered.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-neutral-300 p-6 text-center text-sm font-medium text-neutral-500">
        Les scripts et les voix de cette conversation seront épinglés ici.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {ordered.map((artifact) =>
        artifact.kind === "script" ? (
          <ScriptCard key={artifact.id} artifact={artifact} {...common} />
        ) : (
          <VoiceCard
            key={artifact.id}
            artifact={artifact}
            onChanged={common.onChanged}
            onRework={common.onRework}
          />
        ),
      )}
    </div>
  );
}
