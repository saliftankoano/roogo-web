"use client";

// Studio > Visites terrain (Suivi.dc.html): every field visit sheet with its
// status, and one sheet in detail: the four phases (Tournage, Montage,
// Validation Salif, Publication), the four times, every tick time, what is
// in the Drive and the deliverables. Directeur and Fondateur only.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowSquareOutIcon, CheckIcon, MapPinIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  DELIVERABLES,
  SHOTS,
  STEPS,
  TASK_DEFS,
  hhmm,
  phasesFor,
  plannedPublications,
  shortDate,
  timingSentence,
  videoLengthLabel,
  visitDateLabel,
  type FicheStatusTone,
  type PublicationKey,
} from "@/lib/field-visits/core";
import type { FichePayload, SuiviItem } from "@/lib/field-visits/server";
import { riseIn, staggerIn } from "./motion";

type PersonMini = { id: string; firstName: string; initials: string };

const TONES: Record<FicheStatusTone, string> = {
  green: "bg-[#E3F1E6] text-[#245C33]",
  amber: "bg-[#FCEFD4] text-[#6E4300]",
  red: "bg-[#FBE3DF] text-[#8E2A1E]",
  blue: "bg-[#E1EFF8] text-[#1F5F80]",
  grey: "bg-[#EEEBE7] text-[#4A4540]",
};

/** Which task makes each planned publication ready. */
const PUBLICATION_TASK: Record<PublicationKey, string[]> = {
  presentation: ["t1"],
  marche: ["t2"],
  carrousel: ["t3", "t4"],
  video3d: ["t5"],
};

function dayWord(key: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (key === today) return "Aujourd’hui";
  if (key === yesterday) return "Hier";
  return shortDate(key).replace(/^./, (c) => c.toUpperCase());
}

export function SuiviView({
  initial,
  selectedId,
  people,
  canWithdraw = false,
}: {
  initial: SuiviItem[];
  selectedId: string | null;
  people: PersonMini[];
  /** Founder only: « Retirer cette fiche » (a test sheet, or the wrong listing). */
  canWithdraw?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState<string | null>(selectedId ?? initial[0]?.id ?? null);
  const [detail, setDetail] = useState<FichePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const names = new Map(people.map((p) => [p.id, p]));

  useEffect(() => {
    if (listRef.current) staggerIn(listRef.current.querySelectorAll("li"), 0);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/field-visits/${id}`);
      const body = (await res.json().catch(() => ({}))) as FichePayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
      setDetail(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La fiche n’a pas pu se charger.");
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!selected) {
      setDetail(null);
      url.searchParams.delete("fiche");
      window.history.replaceState(null, "", url);
      return;
    }
    void loadDetail(selected);
    url.searchParams.set("fiche", selected);
    window.history.replaceState(null, "", url);
  }, [selected, loadDetail]);

  /** The sheet and its montage tasks leave the list and the briefings; nothing is deleted. */
  const withdraw = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/field-visits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Le retrait a échoué (erreur ${res.status}).`);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  // A withdrawn (or vanished) sheet hands the detail to the first one left.
  useEffect(() => {
    if (selected && !items.some((item) => item.id === selected)) setSelected(items[0]?.id ?? null);
  }, [items, selected]);

  useEffect(() => {
    if (detail) riseIn(detailRef.current);
  }, [detail?.fiche.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live: statuses ("Sur place depuis…") and the open sheet refresh every minute.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/field-visits?view=suivi");
        if (res.ok) setItems(((await res.json()) as { items: SuiviItem[] }).items);
        if (selected) void loadDetail(selected);
      } catch {
        // keep the last list
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [selected, loadDetail]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-[18px] text-[#1F1A16]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[#F6F1EA]" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <nav aria-label="Studio" className="inline-flex gap-1 rounded-full border border-[#EDE4D8] bg-white/70 p-1">
          <Link href="/admin/studio" className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold text-neutral-600 no-underline hover:text-neutral-900 sm:h-9">
            Projets
          </Link>
          <span aria-current="page" className="inline-flex h-11 items-center rounded-full bg-[#C96A2E]/12 px-3 text-sm font-bold text-[#A8521D] sm:h-9">
            Visites terrain
          </span>
        </nav>
        <h1 className="m-0 text-2xl font-extrabold">Fiches de visite</h1>
        <span className="flex-1" />
        <Link href="/admin/fiche-visite" className="inline-flex h-11 items-center rounded-full bg-[#C96A2E] px-4 text-sm font-extrabold text-white no-underline hover:bg-[#8A4924]">
          Nouvelle fiche
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="m-0 rounded-[18px] border border-dashed border-[#D6CBBE] bg-white/60 px-4 py-6 text-center text-sm text-[#6B625B]">
          Aucune fiche pour l’instant. Une fiche se commence depuis la page d’un bien ou depuis le briefing.
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <aside aria-label="Fiches" className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
            <ul ref={listRef} className="m-0 flex list-none flex-col gap-2 p-0">
              {items.map((item) => {
                const active = item.id === selected;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(item.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-1 rounded-[18px] bg-white p-3 text-left transition-shadow",
                        active ? "shadow-[0_0_0_2px_#C96A2E]" : item.statusLabel.tone === "red" ? "border-2 border-[#E3A79C]" : "border border-[#EAE1D5] hover:border-[#D6CBBE]",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-[#8A4924]">{item.reference ?? "Sans code"}</span>
                        <span className="flex-1" />
                        <span className={cn("inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-extrabold", TONES[item.statusLabel.tone])}>
                          {item.statusLabel.label}
                        </span>
                      </span>
                      <span className="text-[15px] font-extrabold">{item.title}</span>
                      <span className="text-xs text-[#6B625B]">
                        {dayWord(item.visitDate)} · {item.team}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-3">
            {error && (
              <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
                {error}
              </p>
            )}
            {!detail && !error && <div aria-hidden="true" className="h-64 animate-pulse rounded-[20px] bg-white/70" />}
            {detail && (
              <Detail
                ref={detailRef}
                detail={detail}
                names={names}
                onWithdraw={canWithdraw ? () => withdraw(detail.fiche.id) : null}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function Detail({
  detail,
  names,
  ref,
  onWithdraw,
}: {
  detail: FichePayload;
  names: Map<string, PersonMini>;
  ref: React.Ref<HTMLDivElement>;
  onWithdraw: (() => Promise<void>) | null;
}) {
  const { fiche, property } = detail;
  const team = [fiche.person1Id, fiche.person2Id].filter(Boolean).map((id) => names.get(id!)?.firstName ?? "Membre");
  const pubs = plannedPublications(fiche.visitDate);
  const phases = phasesFor({ status: detail.status, tasks: detail.tasks, firstPublication: detail.status === "termine" ? pubs[0].date : null });
  const taskBy = new Map(detail.tasks.map((t) => [t.key, t]));
  const times: [keyof typeof fiche.times, string][] = [
    ["depart", "Départ"],
    ["arrivee", "Arrivée"],
    ["departSite", "Fin sur place"],
    ["retour", "Retour"],
  ];
  const phaseTone = { done: "bg-[#E3F1E6] text-[#245C33]", current: "bg-[#FFF4EA] text-[#C96A2E] shadow-[inset_0_0_0_1px_#F0C9A6]", todo: "bg-[#FBF7F1] text-[#6B625B]" };
  const timing = timingSentence(fiche.times);

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <section className="flex flex-col gap-3.5 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex min-w-0 flex-[1_1_280px] flex-col">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#8A4924]">
              {property.reference ?? "Sans code"} · {fiche.kind === "vente" ? "Vente" : "Location"} · {visitDateLabel(fiche.visitDate).toLowerCase()}
            </span>
            <span className="text-[22px] font-extrabold">{property.title}</span>
            <span className="text-[13px] text-[#6B625B]">
              {team.join(" et ")} · propriétaire : {property.ownerName ?? "non renseigné"}
            </span>
          </span>
          {detail.folderUrl && (
            <a href={detail.folderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#E2D8CC] px-3.5 text-[13px] font-bold text-[#1F1A16] no-underline sm:h-10">
              Ouvrir le dossier Drive <ArrowSquareOutIcon size={13} weight="bold" aria-hidden="true" />
            </a>
          )}
          <Link href={`/admin/fiche-visite/${fiche.id}`} className="inline-flex h-11 items-center rounded-full border border-[#E2D8CC] px-3.5 text-[13px] font-bold text-[#1F1A16] no-underline sm:h-10">
            Ouvrir la fiche
          </Link>
          <Link href="/admin/studio" className="inline-flex h-11 items-center rounded-full bg-[#C96A2E] px-3.5 text-[13px] font-extrabold text-white no-underline sm:h-10">
            Ouvrir le montage
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {phases.map((p) => (
            <div key={p.key} className={cn("flex flex-col gap-0.5 rounded-[14px] p-2.5", phaseTone[p.state])}>
              <span className="text-[11px] font-extrabold uppercase">{p.label}</span>
              <span className="text-sm font-extrabold text-[#1F1A16]">
                {p.value}
                {p.state === "done" && <CheckIcon size={13} weight="bold" className="ml-1 inline text-[#245C33]" aria-hidden="true" />}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
        <section className="flex flex-col gap-2.5 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
          <h2 className="m-0 text-[15px] font-extrabold">Les 4 heures</h2>
          <div className="grid grid-cols-4 gap-1.5">
            {times.map(([key, label]) => (
              <div key={key} className="rounded-xl bg-[#FBF7F1] px-1.5 py-2.5 text-center">
                <span className="block text-[17px] font-extrabold">{hhmm(fiche.times[key]) || "·"}</span>
                <span className="text-[11px] text-[#6B625B]">{label}</span>
              </div>
            ))}
          </div>
          <span className="flex flex-wrap items-center gap-1 text-xs text-[#6B625B]">
            {timing && <span>{timing}</span>}
            {fiche.location ? (
              <a href={`https://www.google.com/maps?q=${fiche.location.lat},${fiche.location.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-bold text-[#8A4924]">
                <MapPinIcon size={12} weight="fill" aria-hidden="true" />
                Position du bien enregistrée{fiche.location.accuracy != null ? ` (${fiche.location.accuracy} m)` : ""}
              </a>
            ) : fiche.locationSkipped ? (
              <span className="font-bold text-[#6E4300]">{fiche.locationSkipped}.</span>
            ) : (
              <span>Position pas encore prise.</span>
            )}
          </span>
        </section>

        <section className="flex flex-col gap-2 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
          <h2 className="m-0 text-[15px] font-extrabold">Dans le Drive</h2>
          {DELIVERABLES.map((d) => {
            const c = detail.uploads[d.key];
            const ready = c?.ready ?? 0;
            const extra = d.key === "photos" || d.key === "trajets" || d.key === "scan" ? (ready ? `${ready} ${ready > 1 ? d.many : d.one}` : "") : c?.seconds ? videoLengthLabel(c.seconds) : ready ? `${ready} ${ready > 1 ? d.many : d.one}` : "";
            return (
              <div key={d.key} className="flex items-center gap-2 text-[13px]">
                {ready ? (
                  <CheckIcon size={14} weight="bold" className="text-[#2F7A48]" aria-label="Dans le Drive" />
                ) : (
                  <WarningCircleIcon size={14} weight="bold" className="text-[#8E2A1E]" aria-label="Manquant" />
                )}
                <span className="flex-1">{d.label}</span>
                <span className={ready ? "text-[#6B625B]" : "font-bold text-[#8E2A1E]"}>{ready ? extra : "manquant"}</span>
              </div>
            );
          })}
          {detail.folderPath && <span className="text-xs text-[#6B625B]">{detail.folderPath.split("/").join(" / ")}</span>}
        </section>
      </div>

      <section className="flex flex-col gap-1 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
        <h2 className="m-0 mb-1.5 text-[15px] font-extrabold">Livrables (jours ouvrables)</h2>
        {pubs.map((p) => {
          const tasks = PUBLICATION_TASK[p.key].map((k) => taskBy.get(k as never)).filter(Boolean);
          const done = tasks.length > 0 && tasks.every((t) => t!.status === "fait");
          const started = detail.status === "termine";
          const owner = tasks[0] ? names.get(tasks[0]!.ownerId)?.firstName : null;
          return (
            <div key={p.key} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 border-t border-[#F0E8DD] py-2 text-[13px] sm:grid-cols-[60px_minmax(0,1fr)_110px_140px]">
              <b className="text-[#8A4924]">J+{p.days}</b>
              <span>
                {p.title}
                {owner ? <span className="text-[#6B625B]"> · {owner}</span> : null}
              </span>
              <span className="col-start-2 text-[#6B625B] sm:col-start-auto sm:text-[#1F1A16]">{shortDate(p.date)}</span>
              <span
                className={cn(
                  "col-start-2 inline-flex h-6 items-center justify-self-start rounded-full px-2.5 text-xs font-extrabold sm:col-start-auto",
                  done ? "bg-[#E3F1E6] text-[#245C33]" : started ? "bg-[#FFF4EA] text-[#A8521D]" : "bg-[#EEEBE7] text-[#4A4540]",
                )}
              >
                {done ? "Prêt, à valider" : started ? "Montage" : "À faire"}
              </span>
            </div>
          );
        })}
        <span className="mt-1.5 text-xs text-[#6B625B]">
          Les dates sont gardées sur la fiche. Elles passeront dans le calendrier du Studio quand il sera branché, et chaque publication attend votre validation.
        </span>
      </section>

      <section className="flex flex-col gap-2 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
        <h2 className="m-0 text-[15px] font-extrabold">Heures de chaque case</h2>
        {fiche.batchWarnings.length > 0 && (
          <p className="m-0 rounded-xl bg-[#FBE3DF] px-3 py-2 text-xs font-bold text-[#8E2A1E]">
            Cases cochées trop vite sur place ({fiche.batchWarnings.length} fois, à {fiche.batchWarnings.map(hhmm).join(", ")}).
          </p>
        )}
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {STEPS.slice(1, 6).map((s, i) => (
            <div key={s.title} className="flex flex-col gap-1 py-1.5">
              <span className="text-xs font-extrabold text-[#8A4924]">{s.title}</span>
              {s.time && <TickLine label={s.time.done} at={fiche.times[s.time.key]} />}
              {s.checks.map((c) => (
                <TickLine key={c.id} label={c.title} at={fiche.checks[c.id]} />
              ))}
              {i === 2 && SHOTS.map((shot) => <TickLine key={shot.key} label={shot.title} at={fiche.shots[shot.key]} />)}
            </div>
          ))}
        </div>
      </section>

      {detail.tasks.length > 0 && (
        <section className="flex flex-col gap-1 rounded-[20px] border border-[#EAE1D5] bg-white p-4">
          <h2 className="m-0 mb-1.5 text-[15px] font-extrabold">Tâches du montage</h2>
          {TASK_DEFS.map((def) => {
            const t = taskBy.get(def.key);
            if (!t) return null;
            return (
              <div key={def.key} className="flex items-center gap-2 border-t border-[#F0E8DD] py-2 text-[13px]">
                {t.status === "fait" ? <CheckIcon size={14} weight="bold" className="text-[#2F7A48]" aria-label="Fait" /> : <span aria-hidden="true" className="size-3.5 rounded-full border-2 border-[#D6CBBE]" />}
                <span className={cn("flex-1", t.status === "fait" && "text-[#6B625B]")}>{t.title}</span>
                <span className="text-[#6B625B]">
                  {names.get(t.ownerId)?.firstName ?? "Membre"} · {shortDate(t.dueDate)}
                  {t.dueTime ? ` avant ${t.dueTime}` : ""}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {onWithdraw && <WithdrawBlock key={fiche.id} taskCount={detail.tasks.length} onWithdraw={onWithdraw} />}
    </div>
  );
}

/**
 * « Retirer cette fiche », founder only, at the bottom of the detail: for a
 * test sheet or one started on the wrong listing. Two steps, so a stray tap
 * does nothing. The sheet is kept, marked abandoned, and its montage tasks
 * leave every briefing.
 */
function WithdrawBlock({ taskCount, onWithdraw }: { taskCount: number; onWithdraw: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasksText = taskCount > 1 ? `ses ${taskCount} tâches de montage quittent` : taskCount === 1 ? "sa tâche de montage quitte" : "";
  return (
    <section aria-label="Retirer la fiche" className="flex flex-col gap-2 rounded-[20px] border border-dashed border-[#E3A79C] bg-white/70 p-4">
      {!confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 min-w-0 flex-[1_1_240px] text-[13px] text-[#6B625B]">
            Fiche de test ou mauvais bien ? Retirez-la du suivi{taskCount ? " et des briefings" : ""}.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex h-11 items-center rounded-full border border-[#E8B9B0] bg-white px-4 text-[13px] font-bold text-[#8E2A1E] sm:h-10"
          >
            Retirer cette fiche
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="m-0 text-sm font-semibold text-[#1F1A16]">
            La fiche quitte le suivi{tasksText ? ` et ${tasksText} les briefings de l’équipe` : ""}. Rien n’est effacé : le dossier Drive reste en place.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onWithdraw();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Le retrait a échoué.");
                  setBusy(false);
                }
              }}
              className="inline-flex h-11 items-center rounded-full bg-[#8E2A1E] px-4 text-[13px] font-extrabold text-white disabled:cursor-wait disabled:opacity-70 sm:h-10"
            >
              {busy ? "Retrait…" : "Oui, retirer la fiche"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="inline-flex h-11 items-center rounded-full border border-[#E2D8CC] bg-white px-4 text-[13px] font-bold text-[#1F1A16] sm:h-10"
            >
              Garder la fiche
            </button>
          </div>
          {error && (
            <p role="alert" className="m-0 rounded-xl bg-[#FBE3DF] px-3 py-2 text-[13px] font-semibold text-[#8E2A1E]">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function TickLine({ label, at }: { label: string; at: string | undefined }) {
  return (
    <span className="flex items-baseline gap-2 text-[13px]">
      <span className={cn("w-11 shrink-0 font-extrabold tabular-nums", at ? "text-[#245C33]" : "text-[#B5ABA2]")}>{at ? hhmm(at) : "·"}</span>
      <span className={at ? "" : "text-[#8F867E]"}>{label}</span>
    </span>
  );
}
