"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  SpinnerGapIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { estimateVoiceoverCostUsd } from "@/lib/studio/budget";
import { findCandidateWords } from "@/lib/studio/candidate-words";
import { formatMoney, type StudioCurrency } from "@/lib/studio/currency";

type TeamEntry = {
  id: string;
  term: string;
  spoken: string;
  author: string | null;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type Builtin = { term: string; spoken: string };

type Row =
  | ({ kind: "team" } & TeamEntry)
  | { kind: "builtin"; id: string; term: string; spoken: string };

type Filter = "all" | "mine" | "builtin";

type Props = {
  voice: string;
  currency: StudioCurrency;
  rate: number;
  scriptText: string;
  onChange: () => void;
};

const inputClass =
  "w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary";

function sortKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function letterOf(term: string) {
  const first = sortKey(term).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

function carrier(spoken: string) {
  return `On dit : ${spoken}.`;
}

export function GlossaryPanel({
  voice,
  currency,
  rate,
  scriptText,
  onChange,
}: Props) {
  const [entries, setEntries] = useState<TeamEntry[]>([]);
  const [builtins, setBuiltins] = useState<Builtin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [spoken, setSpoken] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState("");
  const [editSpoken, setEditSpoken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [listeningKey, setListeningKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const termInputRef = useRef<HTMLInputElement | null>(null);

  const money = useCallback(
    (usd: number) => formatMoney(usd, currency, rate),
    [currency, rate],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/glossary");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as {
        entries: TeamEntry[];
        builtins: Builtin[];
      };
      setEntries(data.entries);
      setBuiltins(data.builtins);
    } catch {
      setMessage("Le glossaire n'a pas pu être chargé.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: Row[] = useMemo(
    () => [
      ...entries.map((entry) => ({ kind: "team" as const, ...entry })),
      ...builtins.map((b) => ({
        kind: "builtin" as const,
        id: `builtin:${b.term}`,
        term: b.term,
        spoken: b.spoken,
      })),
    ],
    [entries, builtins],
  );

  const counts = useMemo(
    () => ({
      all: rows.length,
      mine: rows.filter((r) => r.kind === "team" && r.isMine).length,
      builtin: rows.filter((r) => r.kind === "builtin").length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = sortKey(query.trim());
    return rows
      .filter((row) => {
        if (filter === "mine" && !(row.kind === "team" && row.isMine)) return false;
        if (filter === "builtin" && row.kind !== "builtin") return false;
        if (!needle) return true;
        return (
          sortKey(row.term).includes(needle) ||
          sortKey(row.spoken).includes(needle)
        );
      })
      .sort((a, b) => sortKey(a.term).localeCompare(sortKey(b.term)));
  }, [rows, query, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of visible) {
      const letter = letterOf(row.term);
      map.set(letter, [...(map.get(letter) ?? []), row]);
    }
    return [...map.entries()];
  }, [visible]);

  const candidates = useMemo(() => {
    const known = [
      ...entries.map((e) => e.term),
      ...builtins.flatMap((b) => b.term.split(/\s*\/\s*|\s+/)),
    ];
    return findCandidateWords(scriptText, known);
  }, [scriptText, entries, builtins]);

  async function listen(key: string, spokenForm: string) {
    if (listeningKey) return;
    setListeningKey(key);
    setMessage(null);
    try {
      const price = estimateVoiceoverCostUsd(carrier(spokenForm).length);
      const res = await fetch("/api/admin/studio/glossary/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spoken: spokenForm,
          voice,
          acknowledged_cost_usd: price,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ?? "L'écoute n'a pas pu être générée.");
        return;
      }
      const blob = await res.blob();
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setListeningKey(null);
      await audio.play();
      return;
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    }
    setListeningKey(null);
  }

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/studio/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, spoken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Le mot n'a pas pu être ajouté.");
        return;
      }
      setTerm("");
      setSpoken("");
      await load();
      onChange();
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/studio/glossary?id=${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term: editTerm, spoken: editSpoken }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "La modification a échoué.");
        return;
      }
      setEditingId(null);
      await load();
      onChange();
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/studio/glossary?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Suppression impossible.");
        return;
      }
      await load();
      onChange();
    } catch {
      setMessage("Connexion impossible. Réessayez.");
    }
  }

  const previewCost = money(
    estimateVoiceoverCostUsd(carrier(spoken || "mot").length),
  );

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-bold tracking-tight text-neutral-900">
          Glossaire de prononciation
        </h2>
        <p className="mt-1 text-sm font-medium text-neutral-500">
          Quand la voix prononce mal un mot, ajoutez comment le dire. Tout le
          monde en profite. Vous ne modifiez que vos propres mots.
        </p>
      </header>

      {candidates.length > 0 && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            À vérifier dans votre script
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {candidates.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => {
                  setTerm(word);
                  setSpoken("");
                  termInputRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-amber-900 shadow-sm"
              >
                <PlusIcon size={14} weight="bold" />
                {word}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-neutral-200 bg-white p-4">
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <input
            ref={termInputRef}
            className={inputClass}
            placeholder="Mot écrit (ex : Tanghin)"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Mot écrit"
          />
          <ArrowRightIcon
            size={18}
            weight="bold"
            className="mx-auto hidden text-neutral-400 sm:block"
          />
          <input
            className={inputClass}
            placeholder="Se dit (ex : Than-gain)"
            value={spoken}
            onChange={(e) => setSpoken(e.target.value)}
            aria-label="Comment le dire"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={add}
            disabled={busy || !term.trim() || !spoken.trim()}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-white transition-all active:scale-[0.985] disabled:opacity-40"
          >
            <PlusIcon size={18} weight="bold" />
            Ajouter
          </button>
          <button
            type="button"
            onClick={() => listen("form", spoken.trim())}
            disabled={!spoken.trim() || listeningKey !== null}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-100 px-5 text-sm font-bold text-neutral-700 disabled:opacity-40"
          >
            {listeningKey === "form" ? (
              <SpinnerGapIcon size={18} className="animate-spin" />
            ) : (
              <PlayIcon size={18} weight="fill" />
            )}
            Écouter ({previewCost})
          </button>
        </div>
      </section>

      {message && (
        <p className="text-sm font-bold text-red-600" role="alert">
          {message}
        </p>
      )}

      <section className="space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon
            size={18}
            weight="bold"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            className={cn(inputClass, "pl-11")}
            placeholder="Rechercher un mot"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher un mot"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="tablist">
          {(
            [
              ["all", "Tous", counts.all],
              ["mine", "Les miens", counts.mine],
              ["builtin", "Intégrés", counts.builtin],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm font-bold transition-colors",
                filter === key
                  ? "bg-primary text-white"
                  : "bg-neutral-100 text-neutral-600",
              )}
            >
              {label} <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>

        {!loaded ? (
          <div className="h-24 animate-pulse rounded-3xl bg-neutral-100" />
        ) : visible.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
            <p className="font-bold text-neutral-700">
              {query ? "Aucun mot ne correspond." : "Aucun mot pour le moment."}
            </p>
            {!query && (
              <p className="mt-1 text-sm font-medium text-neutral-500">
                Exemple : Tanghin se dit « Than-gain ».
              </p>
            )}
          </div>
        ) : (
          groups.map(([letter, items]) => (
            <div key={letter} className="space-y-2">
              <h3 className="px-1 pt-2 text-xs font-bold uppercase tracking-widest text-neutral-500">
                {letter}
              </h3>
              <ul className="space-y-2">
                {items.map((row) => {
                  const editing = row.kind === "team" && editingId === row.id;
                  return (
                    <li
                      key={row.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-3"
                    >
                      {editing ? (
                        <div className="space-y-2">
                          <input
                            className={inputClass}
                            value={editTerm}
                            onChange={(e) => setEditTerm(e.target.value)}
                            aria-label="Mot écrit"
                          />
                          <input
                            className={inputClass}
                            value={editSpoken}
                            onChange={(e) => setEditSpoken(e.target.value)}
                            aria-label="Comment le dire"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveEdit(row.id)}
                              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-40"
                            >
                              <CheckIcon size={16} weight="bold" />
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-neutral-700"
                            >
                              <XIcon size={16} weight="bold" />
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => listen(row.id, row.spoken)}
                            disabled={listeningKey !== null}
                            aria-label={`Écouter ${row.term} (${money(
                              estimateVoiceoverCostUsd(carrier(row.spoken).length),
                            )})`}
                            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary disabled:opacity-40"
                          >
                            {listeningKey === row.id ? (
                              <SpinnerGapIcon size={18} className="animate-spin" />
                            ) : (
                              <PlayIcon size={18} weight="fill" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold text-neutral-900">
                              {row.term}
                              <ArrowRightIcon
                                size={14}
                                weight="bold"
                                className="text-neutral-400"
                              />
                              <span className="rounded-lg bg-neutral-100 px-2 py-0.5 text-sm font-semibold text-neutral-700">
                                {row.spoken}
                              </span>
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-neutral-500">
                              {row.kind === "builtin" ? (
                                <>
                                  <LockSimpleIcon size={12} weight="bold" />
                                  Intégré
                                </>
                              ) : (
                                (row.isMine ? "Vous" : (row.author ?? "Équipe"))
                              )}
                            </p>
                          </div>
                          {row.kind === "team" && row.canEdit && (
                            <button
                              type="button"
                              aria-label={`Modifier ${row.term}`}
                              onClick={() => {
                                setEditingId(row.id);
                                setEditTerm(row.term);
                                setEditSpoken(row.spoken);
                              }}
                              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600"
                            >
                              <PencilSimpleIcon size={18} weight="bold" />
                            </button>
                          )}
                          {row.kind === "team" && row.canDelete && (
                            <button
                              type="button"
                              aria-label={`Retirer ${row.term}`}
                              onClick={() => remove(row.id)}
                              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600"
                            >
                              <TrashIcon size={18} weight="bold" />
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
