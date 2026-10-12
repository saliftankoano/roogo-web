"use client";

import { useEffect, useState } from "react";
import { formatSalePct, type SaleLadderLevel } from "@/lib/sale-economics";
import type { StaffSaleLadder as Ladder } from "@/lib/sale-mandate";
import { cn } from "@/lib/utils";

// Staff-only: the sale price ladder for the property on screen, so the team knows
// where the public price sits and how far they may negotiate. The API returns 403
// to anyone else; this panel then renders nothing.

const RUNGS: Record<SaleLadderLevel, { label: string; rule: string }> = {
  listing: { label: "Prix affiché", rule: "Prix de départ, publié par défaut." },
  target: { label: "Objectif", rule: "Le propriétaire reçoit exactement son prix." },
  teamFloor: { label: "Minimum équipe", rule: "L'équipe peut accepter seule jusqu'ici." },
  hardFloor: {
    label: "Plancher absolu",
    rule: "Uniquement avec l'accord de Salif. Jamais en dessous.",
  },
};

function fcfa(n: number) {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

export default function StaffSaleLadder({ propertyId }: { propertyId: string }) {
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/properties/${propertyId}/sale-ladder`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 403) return { hidden: true as const };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { ladder: Ladder | null };
      })
      .then((data) => {
        if (cancelled) return;
        if ("hidden" in data) return setState("hidden");
        setLadder(data.ladder);
        setState("ready");
      })
      .catch((error) => {
        console.error("Sale ladder failed to load:", error);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  if (state === "hidden" || state === "loading") return null;

  return (
    <section className="bg-white p-6 rounded-[32px] border border-neutral-100 shadow-sm">
      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
        Négociation · équipe uniquement
      </p>
      {state === "error" ? (
        <p className="mt-3 text-sm text-red-700">
          Impossible de charger l&apos;échelle de prix. Rechargez la page.
        </p>
      ) : !ladder ? (
        <p className="mt-3 text-sm text-neutral-600">
          Prix du propriétaire inconnu. Envoyez-lui un mandat pour fixer
          l&apos;échelle de prix.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="text-sm text-neutral-600">
            <p>
              Prix du propriétaire :{" "}
              <span className="font-bold text-neutral-900">
                {fcfa(ladder.ownerPrice)}
              </span>{" "}
              <span className="text-neutral-400">
                ({ladder.ownerPriceSource === "mandate" ? "mandat" : "annonce, pas encore de mandat"})
              </span>
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Commission : {formatSalePct(ladder.baseCommissionPct)} de son prix +{" "}
              {formatSalePct(ladder.surplusSplitPct)} du surplus. Notaire et
              apporteurs payés sur la part Roogo.
            </p>
          </div>

          {ladder.currentLevel === "belowFloor" && (
            <p
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
            >
              Le prix affiché ({fcfa(ladder.currentPrice)}) est sous le plancher.
              Corrigez-le.
            </p>
          )}

          <ol className="space-y-2">
            {ladder.rows.map((row) => {
              const current = row.level === ladder.currentLevel;
              const isFloor = row.level === "hardFloor";
              return (
                <li
                  key={row.level}
                  className={cn(
                    "rounded-2xl border px-4 py-3",
                    current
                      ? "border-primary bg-primary/5"
                      : isFloor
                        ? "border-red-100 bg-red-50/50"
                        : "border-neutral-100",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-bold text-neutral-900">
                      {RUNGS[row.level].label}{" "}
                      <span className="font-medium text-neutral-400">
                        +{formatSalePct(row.markupPct)}
                      </span>
                      {current && (
                        <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                          Prix actuel
                        </span>
                      )}
                    </p>
                    <p className="text-sm font-black tabular-nums text-neutral-900">
                      {fcfa(row.price)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {RUNGS[row.level].rule}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <dt className="text-neutral-500">Propriétaire reçoit</dt>
                    <dd className="text-right font-bold text-neutral-900">
                      {fcfa(row.ownerReceives)}
                    </dd>
                    <dt className="text-neutral-500">Commission Roogo</dt>
                    <dd className="text-right text-neutral-900">
                      {fcfa(row.roogoCommission)}
                    </dd>
                    <dt className="text-neutral-500">Après notaire</dt>
                    <dd className="text-right text-neutral-900">
                      {fcfa(row.roogoAfterNotary)}
                    </dd>
                    <dt className="text-neutral-500">Après notaire et apporteurs</dt>
                    <dd className="text-right text-neutral-900">
                      {fcfa(row.roogoAfterAllFees)}
                    </dd>
                  </dl>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
