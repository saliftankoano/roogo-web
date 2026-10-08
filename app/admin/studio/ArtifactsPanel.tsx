"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClosedCaptioningIcon,
  WarningIcon,
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
import type { Artifact, Estimate, PosterCheckField } from "./studio-types";

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

export type CardProps = CommonProps & {
  artifact: Artifact;
  onCaptions: (artifactId: string) => void;
  getCaptionsLabel: (artifactId: string) => string;
  captionsBusy: boolean;
};

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
        <h3 className="text-base font-semibold text-neutral-900">
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
      {estimate && (
        <details className="group rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
          <summary className="cursor-pointer list-none font-semibold text-neutral-700 marker:hidden">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
            Texte envoyé à la voix
            <span className="ml-1 font-medium text-neutral-500">
              {estimate.replacements.length
                ? `(${estimate.replacements.reduce((sum, r) => sum + r.count, 0)} mot${estimate.replacements.reduce((sum, r) => sum + r.count, 0) > 1 ? "s" : ""} respelé${estimate.replacements.reduce((sum, r) => sum + r.count, 0) > 1 ? "s" : ""} par le glossaire)`
                : "(aucun mot du glossaire dans ce script)"}
            </span>
          </summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-neutral-600">{estimate.spokenText}</p>
          {estimate.replacements.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {estimate.replacements.map((r) => (
                <li
                  key={`${r.term}-${r.spoken}`}
                  className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs text-neutral-700"
                >
                  <span className="font-semibold">{r.term}</span> se dit « {r.spoken} »
                  {r.count > 1 ? ` (${r.count} fois)` : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Le script garde l&apos;orthographe normale ; seule cette version respelée part vers la voix.
            Un mot mal prononcé ? Ajoutez-le au glossaire, le texte ci-dessus se met à jour.
          </p>
        </details>
      )}
      {overBudget && (
        <p className="text-sm font-bold text-red-600">
          Plafond mensuel atteint. Demandez à Salif de le relever.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.985] disabled:opacity-40"
        >
          {generating ? (
            <SpinnerGapIcon size={18} className="size-[18px] shrink-0 animate-spin" />
          ) : (
            <MicrophoneIcon size={18} weight="bold" className="size-[18px] shrink-0" />
          )}
          {generating ? "Génération..." : "Générer la voix"}
        </button>
        <span className="min-w-0 text-xs font-medium tabular-nums text-neutral-500">
          {voiceLabel}
          {estimate && !estimate.tooLong ? ` · environ ${money(estimate.estimateUsd)}` : ""}
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            <CopyIcon size={16} weight="bold" className="size-4 shrink-0" />
            {copied ? "Copié" : "Copier"}
          </button>
          <button
            type="button"
            onClick={() => onRework({ ...artifact, text })}
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            <ArrowsClockwiseIcon size={16} weight="bold" className="size-4 shrink-0" />
            Réutiliser
          </button>
        </span>
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
  onCaptions,
  getCaptionsLabel,
  captionsBusy,
}: {
  artifact: Artifact;
  onChanged: () => void;
  onRework: (artifact: Artifact) => void;
  onCaptions: (artifactId: string) => void;
  getCaptionsLabel: (artifactId: string) => string;
  captionsBusy: boolean;
}) {
  return (
    <article className="space-y-3 rounded-3xl border border-primary/30 bg-primary/5 p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-neutral-900">
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
      <button
        type="button"
        disabled={captionsBusy}
        onClick={() => onCaptions(artifact.id)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-neutral-700 disabled:opacity-40"
      >
        {captionsBusy ? (
          <SpinnerGapIcon size={16} className="animate-spin" />
        ) : (
          <ClosedCaptioningIcon size={16} weight="bold" />
        )}
        Sous-titres{getCaptionsLabel(artifact.id)}
      </button>
    </article>
  );
}

function checkSummary(meta: Record<string, unknown>): {
  tone: "ok" | "warn" | "none";
  text: string;
  fields: PosterCheckField[];
} {
  const check = meta.check as
    | { ok?: boolean; fields?: PosterCheckField[]; status?: string }
    | null
    | undefined;
  if (!check) return { tone: "none", text: "", fields: [] };
  if (check.status === "unavailable") {
    return { tone: "warn", text: "Texte non vérifié automatiquement. Relisez-le avant de publier.", fields: [] };
  }
  const wrong = (check.fields ?? []).filter((f) => !f.found);
  if (check.ok || wrong.length === 0) {
    return { tone: "ok", text: "Texte vérifié : prix, téléphone et quartier lus correctement.", fields: [] };
  }
  return { tone: "warn", text: "À vérifier avant de publier :", fields: wrong };
}

function ImageCard({
  artifact,
  onChanged,
}: {
  artifact: Artifact;
  onChanged: () => void;
}) {
  const check = checkSummary(artifact.meta ?? {});
  return (
    <article className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-neutral-900">
          {artifact.title}
        </h3>
        <CardActions artifact={artifact} onChanged={onChanged} />
      </header>
      {artifact.url ? (
        <div
          className="relative w-full overflow-hidden rounded-2xl bg-[repeating-conic-gradient(#eee_0%_25%,#fff_0%_50%)] bg-[length:20px_20px]"
          style={{ aspectRatio: artifact.title.includes("9:16") ? "9 / 16" : artifact.title.includes("Carré") ? "1 / 1" : "4 / 5" }}
        >
          <Image src={artifact.url} alt={artifact.title} fill sizes="360px" unoptimized className="object-contain" />
        </div>
      ) : (
        <p className="text-sm font-medium text-neutral-500">L&apos;image n&apos;est plus disponible.</p>
      )}
      {check.tone !== "none" && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-2xl p-3 text-sm font-bold",
            check.tone === "ok" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900",
          )}
        >
          {check.tone === "ok" ? (
            <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0" />
          ) : (
            <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0" />
          )}
          <div>
            <p>{check.text}</p>
            {check.fields.length > 0 && (
              <ul className="mt-1 list-disc pl-5 font-medium">
                {check.fields.map((field, i) => (
                  <li key={`${field.key}-${i}`}>
                    {field.label} : attendu « {field.expected} »
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <p className="text-sm font-medium text-neutral-500">{artifact.text}</p>
      {artifact.downloadUrl && (
        <a
          href={artifact.downloadUrl}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-neutral-100 text-sm font-bold text-primary"
        >
          <DownloadSimpleIcon size={16} weight="bold" />
          Télécharger l&apos;image
        </a>
      )}
    </article>
  );
}

function CaptionsCard({
  artifact,
  onChanged,
}: {
  artifact: Artifact;
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([artifact.text], { type: "application/x-subrip;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Roogo - Sous-titres.srt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(artifact.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copy can be blocked; the download still works.
    }
  }

  return (
    <article className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-neutral-900">{artifact.title}</h3>
        <CardActions artifact={artifact} onChanged={onChanged} />
      </header>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
        {artifact.text}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={download}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-100 text-sm font-bold text-primary"
        >
          <DownloadSimpleIcon size={16} weight="bold" />
          Télécharger le SRT
        </button>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-100 text-sm font-bold text-neutral-700"
        >
          <CopyIcon size={16} weight="bold" />
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
    </article>
  );
}

// Pinned first, then newest first.
export function orderArtifacts(artifacts: Artifact[]): Artifact[] {
  return [...artifacts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function ArtifactCard({
  artifact,
  onCaptions,
  getCaptionsLabel,
  captionsBusy,
  ...common
}: CardProps) {
  if (artifact.kind === "script") {
    // The key resets the editable text when another script is shown.
    return <ScriptCard key={artifact.id} artifact={artifact} {...common} />;
  }
  if (artifact.kind === "image") {
    return <ImageCard artifact={artifact} onChanged={common.onChanged} />;
  }
  if (artifact.kind === "captions") {
    return <CaptionsCard artifact={artifact} onChanged={common.onChanged} />;
  }
  return (
    <VoiceCard
      artifact={artifact}
      onChanged={common.onChanged}
      onRework={common.onRework}
      onCaptions={onCaptions}
      getCaptionsLabel={getCaptionsLabel}
      captionsBusy={captionsBusy}
    />
  );
}
