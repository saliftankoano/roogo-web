"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DownloadSimpleIcon,
  MagicWandIcon,
  MicrophoneIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FCFA_PER_USD,
  formatMoney,
  type StudioCurrency,
} from "@/lib/studio/currency";
import { GlossaryPanel } from "./GlossaryPanel";
import { VoicePicker, type TermsInfo, type VoiceInfo } from "./VoicePicker";

type VoiceKey = string;

type Estimate = {
  spokenCharacters: number;
  maxCharacters: number;
  tooLong: boolean;
  estimateUsd: number;
  capUsd: number;
  usedUsd: number;
  remainingUsd: number;
  fcfaPerUsd: number;
};

type Result = {
  id: string;
  voice: VoiceKey;
  costUsd: number;
  url: string | null;
  downloadUrl: string | null;
};

type HistoryItem = {
  id: string;
  voice: VoiceKey;
  voiceLabel: string;
  text: string;
  costUsd: number;
  createdAt: string;
  author: string | null;
  url: string | null;
  downloadUrl: string | null;
};

type ScriptWarning = { code: string; message: string };

const VOICE_STORAGE_KEY = "roogo-studio-voice";

const CURRENCY_STORAGE_KEY = "roogo-studio-currency";

function readStoredCurrency(): StudioCurrency {
  try {
    return window.localStorage.getItem(CURRENCY_STORAGE_KEY) === "USD"
      ? "USD"
      : "FCFA";
  } catch {
    return "FCFA";
  }
}

function readStoredVoice(): VoiceKey {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY) || "sandrine";
  } catch {
    // Storage can be blocked; the default voice is fine.
  }
  return "sandrine";
}

const fieldClass =
  "w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary";

export function StudioClient() {
  const [tab, setTab] = useState<"voice" | "glossary">("voice");
  const [currency, setCurrency] = useState<StudioCurrency>("FCFA");
  const [glossaryVersion, setGlossaryVersion] = useState(0);
  const [voice, setVoice] = useState<VoiceKey>("sandrine");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [terms, setTerms] = useState<TermsInfo | null>(null);
  const [brief, setBrief] = useState({
    type: "",
    quartier: "",
    prix: "",
    points: "",
  });
  const [text, setText] = useState("");
  const [warnings, setWarnings] = useState<ScriptWarning[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [writing, setWriting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const estimateSeq = useRef(0);

  useEffect(() => {
    setVoice(readStoredVoice());
    setCurrency(readStoredCurrency());
  }, []);

  const loadVoices = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/voices");
      if (!res.ok) return;
      const data = (await res.json()) as {
        voices: VoiceInfo[];
        terms: TermsInfo;
      };
      setVoices(data.voices);
      setTerms(data.terms);
      // A remembered voice that is no longer usable falls back to the default.
      setVoice((current) =>
        data.voices.some((v) => v.key === current && v.status === "active")
          ? current
          : "sandrine",
      );
    } catch {
      // Without the list the default voice still works.
    }
  }, []);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/history");
      if (!res.ok) return;
      const data = (await res.json()) as { items: HistoryItem[] };
      setHistory(data.items);
    } catch {
      // History is a convenience; the tool still works without it.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Live price: refreshed shortly after the text or the voice changes.
  useEffect(() => {
    if (!text.trim()) {
      setEstimate(null);
      return;
    }
    const seq = ++estimateSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/studio/voiceover/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
        });
        if (!res.ok || seq !== estimateSeq.current) return;
        setEstimate((await res.json()) as Estimate);
      } catch {
        // Keep the last estimate; generation re-checks the price anyway.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [text, voice, glossaryVersion]);

  const rate = estimate?.fcfaPerUsd ?? DEFAULT_FCFA_PER_USD;
  const money = (usd: number) => formatMoney(usd, currency, rate);

  function chooseCurrency(next: StudioCurrency) {
    setCurrency(next);
    try {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    } catch {
      // Not critical.
    }
  }

  function chooseVoice(next: VoiceKey) {
    setVoice(next);
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, next);
    } catch {
      // Not critical.
    }
  }

  async function writeScript() {
    setWriting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/studio/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Le script n'a pas pu être écrit.");
        return;
      }
      setText(data.script);
      setWarnings(data.warnings ?? []);
      setResult(null);
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    } finally {
      setWriting(false);
    }
  }

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
          voice,
          acknowledged_cost_usd: estimate.estimateUsd,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && typeof data.estimateUsd === "number") {
        setEstimate({ ...estimate, estimateUsd: data.estimateUsd });
        setMessage("Le prix a changé. Vérifiez-le puis relancez.");
        return;
      }
      if (!res.ok) {
        setMessage(data.error ?? "La voix n'a pas pu être générée.");
        return;
      }
      setResult(data as Result);
      void loadHistory();
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    } finally {
      setGenerating(false);
    }
  }

  const overBudget = estimate
    ? estimate.estimateUsd > estimate.remainingUsd
    : false;
  const canGenerate =
    !!estimate &&
    !generating &&
    !estimate.tooLong &&
    !overBudget &&
    text.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Studio de contenu
        </h1>
        <p className="mt-1 font-medium text-neutral-500">
          Écrivez ou collez un script, puis générez la voix off.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1">
          {(
            [
              ["voice", "Voix off"],
              ["glossary", "Glossaire"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "min-h-11 rounded-xl px-4 text-sm font-bold transition-colors",
                tab === key ? "bg-white text-primary shadow-sm" : "text-neutral-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => chooseCurrency(currency === "FCFA" ? "USD" : "FCFA")}
          aria-label={
            currency === "FCFA" ? "Afficher les prix en dollars" : "Afficher les prix en FCFA"
          }
          className="min-h-11 rounded-2xl bg-neutral-100 px-4 text-sm font-bold text-neutral-600"
        >
          {currency === "FCFA" ? "FCFA | $" : "$ | FCFA"}
        </button>
      </div>

      <div hidden={tab !== "voice"} className="space-y-6">
      <VoicePicker
        voices={voices}
        terms={terms}
        selectedKey={voice}
        onSelect={chooseVoice}
        onChanged={loadVoices}
      />

      <section className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-500">
          <MagicWandIcon size={18} weight="bold" />
          Écrire le script avec l&apos;IA
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className={fieldClass}
            placeholder="Type de bien (villa, studio...)"
            value={brief.type}
            onChange={(e) => setBrief({ ...brief, type: e.target.value })}
          />
          <input
            className={fieldClass}
            placeholder="Quartier"
            value={brief.quartier}
            onChange={(e) => setBrief({ ...brief, quartier: e.target.value })}
          />
          <input
            className={fieldClass}
            placeholder="Prix (optionnel)"
            value={brief.prix}
            onChange={(e) => setBrief({ ...brief, prix: e.target.value })}
          />
          <input
            className={fieldClass}
            placeholder="Points forts (optionnel)"
            value={brief.points}
            onChange={(e) => setBrief({ ...brief, points: e.target.value })}
          />
        </div>
        <button
          type="button"
          onClick={writeScript}
          disabled={writing || !brief.type.trim() || !brief.quartier.trim()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-6 py-3 text-sm font-bold text-white transition-all active:scale-[0.985] disabled:opacity-40"
        >
          {writing ? (
            <SpinnerGapIcon size={18} className="animate-spin" />
          ) : null}
          Écrire le script
        </button>
      </section>

      <section className="space-y-3">
        <label
          htmlFor="studio-script"
          className="text-sm font-bold uppercase tracking-wider text-neutral-500"
        >
          Script
        </label>
        <textarea
          id="studio-script"
          className={cn(fieldClass, "min-h-48 resize-y leading-relaxed")}
          placeholder="Collez ici le texte à lire, ou écrivez-le avec l'IA ci-dessus."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setWarnings([]);
          }}
        />
        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-2xl bg-amber-50 p-3 text-sm font-medium text-amber-900">
            {warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
        )}
        <p className="text-sm font-medium text-neutral-500" aria-live="polite">
          {estimate
            ? estimate.tooLong
              ? `Trop long : ${estimate.spokenCharacters} caractères pour ${estimate.maxCharacters} au maximum.`
              : `${estimate.spokenCharacters} caractères, environ ${money(estimate.estimateUsd)}. Reste ce mois : ${money(estimate.remainingUsd)} sur ${money(estimate.capUsd)}.`
            : "Le prix apparaît dès que vous écrivez."}
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
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-4 text-base font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.985] disabled:opacity-40"
        >
          {generating ? (
            <SpinnerGapIcon size={20} className="animate-spin" />
          ) : (
            <MicrophoneIcon size={20} weight="bold" />
          )}
          {estimate
            ? `Générer la voix (environ ${money(estimate.estimateUsd)})`
            : "Générer la voix"}
        </button>
        {message && (
          <p className="text-sm font-bold text-red-600" role="alert">
            {message}
          </p>
        )}
      </section>

      {result?.url && (
        <section className="space-y-3 rounded-3xl border border-primary/30 bg-primary/5 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
            Voix prête
          </h2>
          <audio controls src={result.url} className="w-full" />
          {result.downloadUrl && (
            <a
              href={result.downloadUrl}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-primary"
            >
              <DownloadSimpleIcon size={18} weight="bold" />
              Télécharger le MP3
            </a>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
            Voix récentes
          </h2>
          <ul className="space-y-3">
            {history.map((item) => (
              <li
                key={item.id}
                className="space-y-2 rounded-3xl border border-neutral-200 bg-white p-4"
              >
                <p className="line-clamp-2 text-sm font-medium text-neutral-700">
                  {item.text}
                </p>
                <p className="text-xs font-medium text-neutral-400">
                  {item.voiceLabel}
                  {item.author ? `, ${item.author}` : ""},{" "}
                  {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                </p>
                {item.url && <audio controls src={item.url} className="w-full" />}
                {item.downloadUrl && (
                  <a
                    href={item.downloadUrl}
                    className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"
                  >
                    <DownloadSimpleIcon size={16} weight="bold" />
                    Télécharger
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>

      <div hidden={tab !== "glossary"}>
        <GlossaryPanel
          voice={voice}
          currency={currency}
          rate={rate}
          scriptText={text}
          onChange={() => setGlossaryVersion((v) => v + 1)}
        />
      </div>
    </div>
  );
}
