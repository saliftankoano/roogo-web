"use client";

import { useState } from "react";
import { LockSimpleIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type VoiceInfo = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  kind: "system" | "cloned";
  status: "active" | "locked" | "pending" | "revoked";
  isMine: boolean;
  canAccept: boolean;
  canRevoke: boolean;
};

export type TermsInfo = {
  version: string;
  title: string;
  paragraphs: string[];
  checkboxLabel: string;
};

type Props = {
  voices: VoiceInfo[];
  terms: TermsInfo | null;
  selectedKey: string;
  onSelect: (key: string) => void;
  onChanged: () => void;
};

export function VoicePicker({
  voices,
  terms,
  selectedKey,
  onSelect,
  onChanged,
}: Props) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const lockedMine = voices.find((voice) => voice.canAccept);
  const mine = voices.filter((voice) => voice.isMine && voice.canRevoke);

  async function accept(voice: VoiceInfo) {
    if (!terms) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/studio/voices/${voice.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true, terms_version: terms.version }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "L'acceptation n'a pas pu être enregistrée.");
        return;
      }
      setAgreed(false);
      onChanged();
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(voice: VoiceInfo) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/studio/voices/${voice.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Le retrait n'a pas pu être enregistré.");
        return;
      }
      setConfirmRevokeId(null);
      if (selectedKey === voice.key) onSelect("sandrine");
      onChanged();
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <section
        aria-label="Voix"
        className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-50 p-1.5"
      >
        {voices.map((voice) => {
          const usable = voice.status === "active";
          const selected = usable && selectedKey === voice.key;
          return (
            <button
              key={voice.id}
              type="button"
              disabled={!usable}
              onClick={() => onSelect(voice.key)}
              aria-pressed={selected}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-2xl px-3 py-2 text-sm font-bold transition-colors",
                selected ? "bg-white text-primary shadow-sm" : "text-neutral-500",
                !usable && "opacity-60",
              )}
            >
              <span className="flex items-center gap-1">
                {!usable && <LockSimpleIcon size={14} weight="bold" />}
                {voice.label}
              </span>
              <span className="text-xs font-medium opacity-70">
                {usable
                  ? (voice.description ?? "")
                  : voice.status === "pending"
                    ? "En préparation"
                    : "Acceptation requise"}
              </span>
            </button>
          );
        })}
      </section>

      {lockedMine && terms && (
        <section className="space-y-3 rounded-3xl border border-primary/30 bg-primary/5 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
            {terms.title}
          </h2>
          <p className="text-sm font-medium text-neutral-600">
            Votre voix est ajoutée au Studio, mais elle reste verrouillée tant
            que vous n&apos;avez pas accepté ces conditions.
          </p>
          <div className="space-y-2 text-sm text-neutral-700">
            {terms.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm font-bold text-neutral-900">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 size-5 shrink-0 accent-[#C96A2E]"
            />
            {terms.checkboxLabel}
          </label>
          <button
            type="button"
            disabled={!agreed || busy}
            onClick={() => accept(lockedMine)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white transition-all active:scale-[0.985] disabled:opacity-40"
          >
            {busy && <SpinnerGapIcon size={18} className="animate-spin" />}
            Accepter et débloquer ma voix
          </button>
        </section>
      )}

      {mine.map((voice) => (
        <div
          key={voice.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-4 py-3 text-sm"
        >
          <span className="font-medium text-neutral-600">
            Ma voix : <strong className="text-neutral-900">{voice.label}</strong>
          </span>
          {confirmRevokeId === voice.id ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => revoke(voice)}
                className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                Oui, retirer ma voix
              </button>
              <button
                type="button"
                onClick={() => setConfirmRevokeId(null)}
                className="min-h-11 rounded-xl bg-neutral-200 px-4 text-sm font-bold text-neutral-700"
              >
                Annuler
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRevokeId(voice.id)}
              className="min-h-11 rounded-xl bg-neutral-200 px-4 text-sm font-bold text-neutral-700"
            >
              Retirer ma voix
            </button>
          )}
        </div>
      ))}

      {message && (
        <p className="text-sm font-bold text-red-600" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
