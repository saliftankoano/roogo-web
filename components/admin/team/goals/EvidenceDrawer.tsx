"use client";

// « Preuves »: what a goal's number is made of (Bureau.dc.html drawer). A
// side panel on desktop, full screen on the phone. The founder changes the
// target or removes the goal here, confirms a sale, and the founder or the
// Directeur enter a manual reading with its screenshot. The server checks
// each of these again.

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { CameraIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { compressImageToBase64 } from "@/lib/clientImageCompression";
import type { GoalView, GoalsPayload } from "@/lib/team-goals/server";
import { CloseButton, Drawer } from "../Drawer";
import { GoalIcon, STATUS_CHIP, TAB_BADGE } from "./GoalIcon";
import type { GoalsApi } from "./useGoals";

export function EvidenceDrawer({
  goal,
  data,
  api,
  busy,
  error,
  onClose,
  onRemoved,
}: {
  goal: GoalView | null;
  data: GoalsPayload;
  api: GoalsApi;
  busy: Record<string, boolean>;
  error: string | null;
  onClose: () => void;
  onRemoved: (goal: GoalView) => void;
}) {
  const [editingTarget, setEditingTarget] = useState(false);
  const [target, setTarget] = useState("");
  const targetId = useId();

  useEffect(() => {
    setEditingTarget(false);
    setTarget(goal ? String(goal.target) : "");
  }, [goal?.id, goal?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!goal) return null;
  const canManage = data.canManage;

  return (
    <Drawer
      open
      onClose={onClose}
      label={`Preuves : ${goal.title}`}
      header={
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <GoalIcon kind={goal.icon} />
            <span className="flex-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">Preuves · {goal.source}</span>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="m-0 text-[22px] font-extrabold leading-tight lg:text-2xl">{goal.title}</h2>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[34px] font-extrabold leading-none">{goal.currentLabel}</span>
            <span className="text-[15px] font-bold text-[#6B625B]">/ {goal.targetLabel} {goal.ended ? `· ${goal.countdown}` : goal.endPhrase}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-extrabold", STATUS_CHIP[goal.tone])}>{goal.statusLabel}</span>
            <span className={cn("inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-extrabold", TAB_BADGE[goal.tab])}>
              {goal.periodLabel} · {goal.countdown}
            </span>
            {!goal.ended && goal.status !== "atteint" && (
              <span className="text-xs font-bold text-[#6B625B]">Il reste {goal.remainingLabel} · {goal.need}</span>
            )}
          </span>
          <p className="m-0 text-sm leading-[1.45] text-[#4A4540]">{goal.measure}</p>
        </div>
      }
      footer={
        canManage ? (
          editingTarget ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const n = Number(target.replace(/\s/g, ""));
                if (!Number.isInteger(n) || n < 1) return;
                const ok = await api.setTarget(goal.id, n);
                if (ok) setEditingTarget(false);
              }}
            >
              <label htmlFor={targetId} className="flex flex-col gap-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">
                Nouvelle cible
                <input
                  id={targetId}
                  inputMode="numeric"
                  autoFocus
                  value={target}
                  onChange={(event) => setTarget(event.target.value.replace(/[^\d\s]/g, ""))}
                  className="h-11 w-36 rounded-xl border border-[#E2D8CC] bg-[#FBF7F1] px-3 text-base font-bold normal-case tracking-normal text-[#1F1A16]"
                />
              </label>
              <button type="submit" disabled={busy[`goal:${goal.id}`]} className="h-11 rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white disabled:opacity-60">
                Enregistrer
              </button>
              <button type="button" onClick={() => setEditingTarget(false)} className="h-11 rounded-full border border-[#E2D8CC] bg-white px-4 text-sm font-bold">
                Annuler
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditingTarget(true)}
                className="h-11 cursor-pointer rounded-full border border-[#E2D8CC] bg-white px-4 text-sm font-bold hover:border-[#C96A2E]"
              >
                Modifier la cible
              </button>
              <span className="flex-1" />
              <button
                type="button"
                disabled={busy[`goal:${goal.id}`]}
                onClick={async () => {
                  const ok = await api.archive(goal.id);
                  if (ok) onRemoved(goal);
                }}
                className="h-11 cursor-pointer rounded-full bg-[#FBE3DF] px-4 text-sm font-extrabold text-[#8E2A1E] disabled:opacity-60"
              >
                Retirer l’objectif
              </button>
            </div>
          )
        ) : (
          <span className="flex items-center gap-2 text-xs text-[#6B625B]">
            <LockSimpleIcon size={14} aria-hidden="true" />
            Visible par toute l’équipe. Seul le Fondateur crée et modifie les objectifs.
          </span>
        )
      }
    >
      <div className="flex flex-col py-2">
        {error && (
          <p role="alert" className="mx-4 my-2 rounded-2xl bg-[#FBE3DF] px-3 py-2.5 text-sm font-semibold text-[#8E2A1E] lg:mx-5">
            {error}
          </p>
        )}
        {goal.manual && data.canEnterReading && <ReadingForm goal={goal} api={api} busy={!!busy[`reading:${goal.metric}`]} todayKey={data.todayKey} />}
        {goal.metric === "properties_sold" && canManage && goal.forSale.length > 0 && (
          <SaleForm goal={goal} api={api} busy={!!busy.sale} todayKey={data.todayKey} />
        )}

        {goal.history.length > 0 && (
          <>
            <span className="block px-4 pb-1 pt-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B] lg:px-5">Mois passés</span>
            {goal.history.map((row) => (
              <div key={row.key} data-drawer-row className="flex items-center gap-3 border-b border-[#F4EEE6] px-4 py-2.5 lg:px-5">
                <span className="flex-1 text-[15px] font-extrabold">{row.label}</span>
                <span className="text-sm font-extrabold">{row.value} / {goal.targetLabel}</span>
                <span className={cn("inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-extrabold", row.reached ? STATUS_CHIP.green : STATUS_CHIP.grey)}>
                  {row.reached ? "Atteint" : "Pas atteint"}
                </span>
              </div>
            ))}
          </>
        )}

        <span className="block px-4 pb-1 pt-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B] lg:px-5">{goal.listTitle}</span>
        {goal.evidence.length === 0 && (
          <p className="m-0 px-4 py-3 text-sm text-[#6B625B] lg:px-5">Rien pour l’instant.</p>
        )}
        {goal.evidence.map((row) => (
          <div key={row.key} data-drawer-row className={cn("flex items-center gap-3 border-b border-[#F4EEE6] px-4 py-3 lg:px-5", row.muted && "opacity-80")}>
            <span
              className={cn(
                "inline-flex h-[26px] min-w-16 shrink-0 items-center justify-center rounded-lg px-2 text-[11px] font-extrabold",
                row.tagTone === "dark" ? "bg-[#1F1A16] text-white" : "bg-[#F4EEE6] text-[#4A4540]",
              )}
            >
              {row.tag}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-extrabold leading-snug [overflow-wrap:anywhere]">{row.title}</span>
              {row.sub && <span className="text-[13px] leading-snug text-[#6B625B] [overflow-wrap:anywhere]">{row.sub}</span>}
            </div>
            {row.proofUrl && row.link && (
              <a
                href={row.proofUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-[#E2D8CC] px-3 text-xs font-extrabold text-[#1F1A16] no-underline lg:h-9"
              >
                {row.link}
              </a>
            )}
            {!row.proofUrl && row.href && row.link && (
              <Link
                href={row.href}
                className="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-[#E2D8CC] px-3 text-xs font-extrabold text-[#1F1A16] no-underline lg:h-9"
              >
                {row.link}
              </Link>
            )}
            {row.saleId && canManage && (
              <button
                type="button"
                disabled={busy[`sale:${row.saleId}`]}
                onClick={() => api.removeSale(row.saleId!)}
                className="inline-flex h-11 shrink-0 items-center rounded-full px-2 text-xs font-bold text-[#8E2A1E] lg:h-9"
              >
                Retirer
              </button>
            )}
          </div>
        ))}

        {goal.levers.length > 0 && (
          <div className="mx-4 mt-4 flex flex-col gap-2 rounded-2xl border border-[#EFE6DA] bg-[#FBF7F1] p-3 lg:mx-5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#C96A2E]">Pour que ce soit inévitable</span>
            {goal.levers.map((lever) => (
              <span key={lever.id} className="flex items-center gap-2 text-[13px]">
                <span className="flex-1 font-bold leading-snug">{lever.title}</span>
                <span className="whitespace-nowrap text-[#6B625B]">{lever.ownerName} · {lever.done} / {lever.weeklyTarget}</span>
              </span>
            ))}
            <Link href={`/admin/objectifs?objectif=${goal.id}`} className="self-start text-[13px] font-extrabold text-[#8A4924]">
              Voir les leviers
            </Link>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function ReadingForm({ goal, api, busy, todayKey }: { goal: GoalView; api: GoalsApi; busy: boolean; todayKey: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayKey);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  if (!open) {
    return (
      <div className="px-4 pb-1 pt-2 lg:px-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-11 w-full cursor-pointer rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white"
        >
          Saisir le chiffre du jour
        </button>
      </div>
    );
  }
  return (
    <form
      className="mx-4 my-2 flex flex-col gap-2.5 rounded-2xl border border-[#EFE6DA] bg-[#FBF7F1] p-3 lg:mx-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setProblem(null);
        const n = Number(value.replace(/\s/g, ""));
        if (!Number.isInteger(n) || n < 0) {
          setProblem("Écrivez le chiffre lu, sans décimale.");
          return;
        }
        let proof: { data: string; ext: string } | null = null;
        if (file) {
          try {
            const compressed = await compressImageToBase64(file);
            proof = { data: compressed.data, ext: compressed.ext };
          } catch (err) {
            setProblem(`La capture n’a pas pu être préparée (${err instanceof Error ? err.message : "erreur inconnue"}).`);
            return;
          }
        }
        const ok = await api.addReading({ metric: goal.metric, value: n, measuredOn: date, note, proof });
        if (ok) {
          setOpen(false);
          setValue("");
          setNote("");
          setFile(null);
        }
      }}
    >
      <span className="text-sm font-extrabold">Nouveau relevé, {goal.family}</span>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-v`} className="flex min-w-0 flex-[1_1_120px] flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
          Abonnés
          <input
            id={`${id}-v`}
            inputMode="numeric"
            autoFocus
            required
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^\d\s]/g, ""))}
            className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-base font-bold text-[#1F1A16]"
          />
        </label>
        <label htmlFor={`${id}-d`} className="flex min-w-0 flex-[1_1_140px] flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
          Lu le
          <input
            id={`${id}-d`}
            type="date"
            max={todayKey}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-[15px] text-[#1F1A16]"
          />
        </label>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#D6CBBE] bg-white px-3 py-2 text-[13px] font-bold">
        <CameraIcon size={18} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{file ? file.name : "Ajouter la capture d’écran (preuve)"}</span>
        <input type="file" accept="image/*" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <label htmlFor={`${id}-n`} className="flex flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
        Note (facultatif)
        <input
          id={`${id}-n`}
          maxLength={300}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-sm font-medium text-[#1F1A16]"
        />
      </label>
      {problem && <p role="alert" className="m-0 text-sm font-semibold text-[#8E2A1E]">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="h-11 flex-1 rounded-full bg-[#C96A2E] px-4 text-sm font-extrabold text-white disabled:opacity-60">
          {busy ? "Envoi…" : "Enregistrer le relevé"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full border border-[#E2D8CC] bg-white px-4 text-sm font-bold">
          Annuler
        </button>
      </div>
    </form>
  );
}

function SaleForm({ goal, api, busy, todayKey }: { goal: GoalView; api: GoalsApi; busy: boolean; todayKey: string }) {
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [date, setDate] = useState(todayKey);
  const id = useId();
  if (!open) {
    return (
      <div className="px-4 pb-1 pt-2 lg:px-5">
        <button type="button" onClick={() => setOpen(true)} className="h-11 w-full cursor-pointer rounded-full bg-[#1F1A16] px-4 text-sm font-extrabold text-white">
          Confirmer une vente signée
        </button>
      </div>
    );
  }
  return (
    <form
      className="mx-4 my-2 flex flex-col gap-2.5 rounded-2xl border border-[#EFE6DA] bg-[#FBF7F1] p-3 lg:mx-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!propertyId) return;
        const ok = await api.confirmSale({ propertyId, signedOn: date });
        if (ok) setOpen(false);
      }}
    >
      <span className="text-sm font-extrabold">Une vente compte quand l’acte est signé chez le notaire.</span>
      <label htmlFor={`${id}-p`} className="flex flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
        Bien vendu
        <select
          id={`${id}-p`}
          required
          value={propertyId}
          onChange={(event) => setPropertyId(event.target.value)}
          className="h-11 min-w-0 rounded-xl border border-[#E2D8CC] bg-white px-2 text-sm font-bold text-[#1F1A16]"
        >
          <option value="">Choisir…</option>
          {goal.forSale.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-d`} className="flex flex-col gap-1 text-xs font-extrabold text-[#6B625B]">
        Signé chez le notaire le
        <input id={`${id}-d`} type="date" max={todayKey} value={date} onChange={(event) => setDate(event.target.value)} className="h-11 rounded-xl border border-[#E2D8CC] bg-white px-3 text-[15px] text-[#1F1A16]" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !propertyId} className="h-11 flex-1 rounded-full bg-[#C96A2E] px-4 text-sm font-extrabold text-white disabled:opacity-60">
          Confirmer la vente
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full border border-[#E2D8CC] bg-white px-4 text-sm font-bold">
          Annuler
        </button>
      </div>
    </form>
  );
}
