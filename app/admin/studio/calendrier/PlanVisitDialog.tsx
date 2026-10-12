"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { HouseLineIcon, MapPinIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { VISIT_CADENCE, dayLabel, isIsoDate, isoToDateAndSlot, planVisitCadence, type Role } from "@/lib/studio/publishing";
import { PropertyPicker } from "../PropertyPicker";
import { primaryGradient } from "../studio-ui";
import type { PropertySummary } from "../studio-types";
import { NetworkIcons } from "./NetworkIcons";
import { readError, type Post, type TeamMember } from "./calendar-types";

const ease = [0.22, 1, 0.36, 1] as const;
const field = "w-full rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 outline-none focus:border-primary";

/**
 * "Planifier une visite": pick the property and the visit date, and the five
 * posts of the field visit sheet appear on business days (J+1, J+2, J+4 twice,
 * J+5), all "à faire". The preview uses the same function as the server.
 */
export function PlanVisitDialog({
  slots,
  team,
  me,
  onClose,
  onPlanned,
}: {
  slots: string[];
  team: TeamMember[];
  me: { id: string; role: Role };
  onClose: () => void;
  onPlanned: (posts: Post[]) => void;
}) {
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assigneeId, setAssigneeId] = useState(me.id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plan = useMemo(() => (isIsoDate(visitDate) ? planVisitCadence(visitDate, slots) : []), [visitDate, slots]);

  async function submit() {
    if (!property) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/studio/publications/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: property.id, visitDate, assigneeId }),
      });
      if (!res.ok) throw new Error(await readError(res));
      onPlanned(((await res.json()) as { posts: Post[] }).posts);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[90] flex items-start justify-center bg-neutral-900/30 p-4 pt-16 sm:items-center sm:pt-4"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-visit-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.22, ease }}
        className="flex max-h-[min(88dvh,820px)] w-full max-w-xl flex-col gap-4 overflow-hidden rounded-3xl bg-[#fbf6f0] p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="plan-visit-title" className="flex items-center gap-2 text-base font-bold text-neutral-900">
              <MapPinIcon size={18} weight="bold" className="text-[#a8521d]" />
              Planifier une visite
            </h2>
            <p className="text-xs text-neutral-500">Les 5 publications de la fiche de visite, en jours ouvrés après la visite. Toutes « À faire ».</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex size-10 items-center justify-center rounded-xl text-neutral-500 hover:bg-white">
            <XIcon size={18} weight="bold" />
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto">
          {property ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white p-2 ring-1 ring-inset ring-[rgba(74,52,36,0.08)]">
              <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                {property.image ? <Image src={property.image} alt="" fill sizes="48px" unoptimized className="object-cover" /> : <HouseLineIcon size={20} className="absolute inset-0 m-auto text-neutral-400" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-neutral-900">{property.title}</span>
                <span className="block truncate text-xs text-neutral-500">{property.price}</span>
              </span>
              <button type="button" onClick={() => setProperty(null)} className="h-9 rounded-full px-3 text-sm font-semibold text-[#a8521d] hover:bg-primary/10">
                Changer
              </button>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <PropertyPicker onPick={setProperty} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-neutral-600">Date de la visite</span>
              <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className={field} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-neutral-600">Responsable</span>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={field}>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {plan.length > 0 && (
            <ol className="grid gap-1.5">
              {plan.map((p, i) => {
                const { date, slot } = isoToDateAndSlot(p.scheduledAt);
                const d = dayLabel(date);
                return (
                  <li key={p.step} className="flex items-center gap-3 rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-inset ring-[rgba(74,52,36,0.06)]">
                    <span className="w-12 shrink-0 text-xs font-bold tabular-nums text-[#a8521d]">J+{VISIT_CADENCE[i].offset}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900">{p.title}</span>
                      <span className="block text-xs text-neutral-500">
                        {d.name} {d.date}, {slot}
                      </span>
                    </span>
                    <NetworkIcons networks={p.networks} />
                  </li>
                );
              })}
            </ol>
          )}
          {message && (
            <p role="alert" className="text-sm font-semibold text-red-600">
              {message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-sm font-semibold text-neutral-600 hover:bg-white">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!property || !plan.length || busy}
            className={cn("h-10 rounded-full px-4 text-sm font-semibold disabled:opacity-50", primaryGradient)}
          >
            {busy ? "Création…" : "Créer les 5 publications"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
