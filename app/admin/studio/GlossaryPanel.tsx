"use client";

import { useCallback, useEffect, useState } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";

type Entry = {
  id: string;
  term: string;
  spoken: string;
  author: string | null;
  canDelete: boolean;
};

type Builtin = { term: string; spoken: string };

const fieldClass =
  "w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary";

export function GlossaryPanel({ onChange }: { onChange: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [builtins, setBuiltins] = useState<Builtin[]>([]);
  const [term, setTerm] = useState("");
  const [spoken, setSpoken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/glossary");
      if (!res.ok) return;
      const data = (await res.json()) as {
        entries: Entry[];
        builtins: Builtin[];
      };
      setEntries(data.entries);
      setBuiltins(data.builtins);
    } catch {
      setMessage("Le glossaire n'a pas pu être chargé.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="space-y-6">
      <p className="font-medium text-neutral-500">
        Les mots difficiles et la façon de les dire. Tout le monde peut
        ajouter un mot. Vous ne pouvez retirer que vos propres mots.
      </p>

      <section className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          Ajouter un mot
        </h2>
        <input
          className={fieldClass}
          placeholder="Mot tel qu'il est écrit (ex : Tanghin)"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <input
          className={fieldClass}
          placeholder="Comment le dire (ex : Than-gain)"
          value={spoken}
          onChange={(e) => setSpoken(e.target.value)}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !term.trim() || !spoken.trim()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white transition-all active:scale-[0.985] disabled:opacity-40"
        >
          <PlusIcon size={18} weight="bold" />
          Ajouter au glossaire
        </button>
        {message && (
          <p className="text-sm font-bold text-red-600" role="alert">
            {message}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          Mots de l&apos;équipe ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm font-medium text-neutral-400">
            Aucun mot ajouté pour le moment.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="font-bold text-neutral-900">
                    {entry.term}
                    <span className="mx-2 text-neutral-400">se dit</span>
                    {entry.spoken}
                  </p>
                  {entry.author && (
                    <p className="text-xs font-medium text-neutral-400">
                      Ajouté par {entry.author}
                    </p>
                  )}
                </div>
                {entry.canDelete && (
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    aria-label={`Retirer ${entry.term}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600"
                  >
                    <TrashIcon size={18} weight="bold" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          Déjà intégrés (non modifiables)
        </h2>
        <ul className="space-y-2">
          {builtins.map((item) => (
            <li
              key={item.term}
              className="rounded-2xl bg-neutral-100 p-4 text-sm font-medium text-neutral-600"
            >
              {item.term}
              <span className="mx-2 text-neutral-400">se dit</span>
              {item.spoken}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
