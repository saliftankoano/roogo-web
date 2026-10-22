"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { AnimatedAmount } from "@/components/sale/AnimatedAmount";
import { SaleSplitBar } from "@/components/sale/SaleSplitBar";
import { SALE_PARTY_COLORS, fcfaFull, type SalePartyKey } from "@/components/sale/saleColors";
import {
  DEFAULT_SALE_ECONOMICS,
  formatSaleMillions,
  formatSalePct,
  saleBreakdown,
  salePriceApproval,
  staffSimulatorSteps,
  type SaleSimulatorLevel,
} from "@/lib/sale-economics";
import type { StaffSaleLadder as Ladder } from "@/lib/sale-mandate";
import { roogoMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Staff-only « Simulateur de prix de vente » (design approved by Salif on
// 2026-10-18): five rising steps (owner's price, +10 %, +15 %, +20 %, +30 %)
// plus a slider for any other price, who decides at that price, and the whole
// split of the sale between the owner, the notary, the buyer's intermediary,
// the seller's sponsor and Roogo. The API returns 403 to anyone else; this
// panel then renders nothing.

const STEP_NAMES: Record<SaleSimulatorLevel, string> = {
  ownerPrice: "Prix demandé",
  teamFloor: "Minimum équipe",
  reference: "Repère",
  target: "Objectif",
  listing: "Prix affiché",
};
const STEP_HEIGHTS = [62, 82, 100, 120, 150];
const SLIDER_STEP = 250_000;
const short = (n: number) => formatSaleMillions(n);

function Switch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "flex h-6 w-10 flex-none items-center rounded-full p-0.5 transition-colors duration-200",
        on ? "justify-end bg-primary" : "justify-start bg-[#D8CCC0]",
      )}
    >
      <motion.span
        layout
        transition={roogoMotion.standard}
        className="block h-5 w-5 rounded-full bg-white shadow-sm"
      />
    </button>
  );
}

function Simulator({ ladder }: { ladder: Ladder }) {
  const P = ladder.ownerPrice;
  const pcts = useMemo(() => {
    const pct = (level: string, fallback: number) =>
      ladder.rows.find((r) => r.level === level)?.markupPct ?? fallback;
    const d = DEFAULT_SALE_ECONOMICS;
    return {
      ...d,
      listingMarkupPct: pct("listing", d.listingMarkupPct),
      targetMarkupPct: pct("target", d.targetMarkupPct),
      referenceMarkupPct: pct("reference", d.referenceMarkupPct),
      teamFloorMarkupPct: pct("teamFloor", d.teamFloorMarkupPct),
      baseCommissionPct: ladder.baseCommissionPct,
      surplusSplitPct: ladder.surplusSplitPct,
    };
  }, [ladder]);
  const steps = useMemo(() => staffSimulatorSteps(P, pcts), [P, pcts]);
  const listing = steps[steps.length - 1].price;
  const sliderMin = Math.floor((P * 0.9) / SLIDER_STEP) * SLIDER_STEP;
  const sliderMax = Math.ceil((P * 1.4) / SLIDER_STEP) * SLIDER_STEP;
  const [sale, setSale] = useState(ladder.currentPrice > 0 ? ladder.currentPrice : listing);
  const [intermediary, setIntermediary] = useState(true);
  const [sponsor, setSponsor] = useState(false);

  const b = saleBreakdown(sale, P, pcts, {
    buyerReferred: intermediary,
    sellerReferred: sponsor,
  });
  const founder = salePriceApproval(sale, P, pcts) === "founder";

  const rows: {
    key: SalePartyKey;
    label: string;
    amount: number;
    active: boolean;
    strong?: boolean;
    toggle?: () => void;
  }[] = [
    { key: "owner", label: "Propriétaire", amount: b.ownerReceives, active: true, strong: true },
    { key: "notary", label: `Notaire (${formatSalePct(pcts.notaryFeePct)})`, amount: b.notaryFee, active: true },
    {
      key: "intermediary",
      label: `Intermédiaire acheteur (${formatSalePct(pcts.buyerReferralPct)})`,
      amount: Math.round(sale * pcts.buyerReferralPct),
      active: intermediary,
      toggle: () => setIntermediary((v) => !v),
    },
    {
      key: "sponsor",
      label: `Parrain du vendeur (${formatSalePct(pcts.sellerReferralPct)})`,
      amount: Math.round(sale * pcts.sellerReferralPct),
      active: sponsor,
      toggle: () => setSponsor((v) => !v),
    },
    { key: "roogo", label: "Roogo garde", amount: b.roogoNet, active: true, strong: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-[#F3EBE2] px-4 py-3">
        <span className="text-[13px] font-bold text-[#72584B]">
          Prix du propriétaire ({ladder.ownerPriceSource === "mandate" ? "mandat" : "annonce"})
        </span>
        <span className="whitespace-nowrap text-lg font-black tabular-nums text-[#251B16]">
          {fcfaFull(P)}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#72584B]">
          Si on vend à…
        </p>
        <div className="grid h-[156px] grid-cols-5 items-end gap-1.5">
          {steps.map((s, i) => {
            const ownerStep = s.level === "ownerPrice";
            const on = Math.abs(s.price - sale) < 1;
            return (
              <motion.button
                key={s.level}
                type="button"
                aria-pressed={on}
                aria-label={`${STEP_NAMES[s.level]}, ${fcfaFull(s.price)}`}
                onClick={() => setSale(s.price)}
                initial={{ height: 0 }}
                animate={{
                  height: STEP_HEIGHTS[i],
                  y: on ? -3 : 0,
                  scale: on ? 1.03 : 1,
                  backgroundColor: on ? "#C96A2E" : ownerStep ? "#F8E3DA" : "#F2C9A8",
                }}
                transition={{ ...roogoMotion.deliberate, height: { ...roogoMotion.deliberate, delay: i * 0.06 } }}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 overflow-hidden rounded-t-[14px] rounded-b-md px-0.5 pt-2",
                  on
                    ? "text-white shadow-[0_10px_20px_-10px_rgba(201,106,46,0.9)]"
                    : ownerStep
                      ? "text-[#6E2817]"
                      : "text-[#4A2614]",
                )}
              >
                {ownerStep ? (
                  <>
                    <span className="text-[10px] font-extrabold leading-tight">Prix proprio</span>
                    <span className="whitespace-nowrap text-[15px] font-black leading-tight">
                      {short(s.price)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[15px] font-black leading-tight">
                      +{formatSalePct(s.markupPct)}
                    </span>
                    <span className="whitespace-nowrap text-[11px] font-extrabold leading-tight">
                      {short(s.price)}
                    </span>
                  </>
                )}
              </motion.button>
            );
          })}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {steps.map((s) => (
            <span
              key={s.level}
              className="text-center text-[10px] font-bold leading-tight text-[#72584B]"
            >
              {STEP_NAMES[s.level]}
            </span>
          ))}
        </div>
        <label className="mt-1 flex flex-col gap-1">
          <span className="text-xs font-bold text-[#72584B]">Ou glisser pour un autre prix</span>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={SLIDER_STEP}
            value={Math.min(sliderMax, Math.max(sliderMin, sale))}
            onChange={(e) => setSale(Number(e.target.value))}
            aria-valuetext={fcfaFull(sale)}
            className="w-full accent-primary"
          />
        </label>
      </div>

      <div className="space-y-3 rounded-[22px] border border-[#EADFD3] bg-white p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#72584B]">Vente à</p>
            <AnimatedAmount
              value={sale}
              format={fcfaFull}
              className="block whitespace-nowrap text-[22px] font-black leading-tight tabular-nums text-[#251B16]"
            />
          </div>
          <span
            className={cn(
              "inline-flex h-[26px] flex-none items-center rounded-full px-2.5 text-xs font-extrabold transition-colors duration-200",
              founder ? "bg-[#F8E3DA] text-[#8E3420]" : "bg-[#DDF0E2] text-[#245C33]",
            )}
          >
            {founder ? "Accord de Salif" : "L'équipe décide"}
          </span>
        </div>

        <SaleSplitBar
          className="h-7 rounded-[10px] bg-white"
          label={`Répartition de ${fcfaFull(sale)} : propriétaire ${fcfaFull(
            b.ownerReceives,
          )}, Roogo garde ${fcfaFull(b.roogoNet)}`}
          segments={rows.map((r) => ({
            key: r.key,
            value: r.active ? Math.max(0, r.amount) : 0,
            color: SALE_PARTY_COLORS[r.key],
          }))}
        />

        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <span
                className="h-3 w-3 flex-none rounded-[4px] transition-colors duration-200"
                style={{ backgroundColor: r.active ? SALE_PARTY_COLORS[r.key] : "#E5DBD1" }}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 text-[13px] leading-snug text-[#251B16]",
                  r.strong ? "font-extrabold" : "font-medium",
                )}
              >
                {r.label}
              </span>
              {r.toggle && <Switch on={r.active} onToggle={r.toggle} label={r.label} />}
              {r.active ? (
                <AnimatedAmount
                  value={r.amount}
                  format={fcfaFull}
                  className="flex-none whitespace-nowrap text-right text-[13px] font-extrabold tabular-nums text-[#251B16]"
                />
              ) : (
                <span className="flex-none text-right text-[13px] font-extrabold text-[#A8968A]">non</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-2xl bg-[#251B16] p-3 text-[#FFFAF5]">
          <span className="text-[11px] font-bold text-[#F2B48A]">Propriétaire reçoit</span>
          <AnimatedAmount
            value={b.ownerReceives}
            format={(n) => `${short(n)} FCFA`}
            className="whitespace-nowrap text-lg font-black"
          />
          <span className="text-[11px] text-[#E9DDD2]">
            {b.ownerDelta >= 0
              ? `+${short(b.ownerDelta)} au-dessus de son prix`
              : `${short(-b.ownerDelta)} sous son prix`}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl bg-primary p-3 text-white">
          <span className="text-[11px] font-bold text-[#FBE3CF]">Roogo garde</span>
          <AnimatedAmount
            value={b.roogoNet}
            format={(n) => `${short(n)} FCFA`}
            className="whitespace-nowrap text-lg font-black"
          />
          <span className="text-[11px] text-[#FBE3CF]">après notaire et aides</span>
        </div>
      </div>

      {ladder.currentLevel === "belowTeamFloor" && (
        <p
          role="status"
          className="rounded-2xl bg-[#F8E3DA] px-3 py-2 text-xs font-bold text-[#8E3420]"
        >
          Le prix affiché ({fcfaFull(ladder.currentPrice)}) est sous +10 %. Ce prix
          demande l&apos;accord de Salif.
        </p>
      )}
    </div>
  );
}

function Approvals({ ladder }: { ladder: Ladder }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#72584B]">
        Accords sous +10 %
      </p>
      {ladder.approvals.length === 0 ? (
        <p className="mt-2 text-xs text-[#72584B]">Aucun accord enregistré.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {ladder.approvals.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-[#F2C9A8] bg-[#FDF6EF] px-4 py-3 text-xs text-neutral-700"
            >
              <p className="font-bold text-neutral-900">
                {fcfaFull(a.newPrice)}{" "}
                <span className="font-medium text-neutral-500">
                  ({a.markupPct >= 0 ? "+" : ""}
                  {formatSalePct(a.markupPct)} sur le prix du propriétaire)
                </span>
              </p>
              <p className="mt-0.5">
                Accord de {a.approverName ?? "membre inconnu"} (
                {a.approverLevel === "founder" ? "Fondateur" : "Directeur"}), le{" "}
                {new Date(a.approvedAt).toLocaleString("fr-FR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
              {(a.discussedWithSalif || a.ownerAgreed) && (
                <ul className="mt-1 list-inside list-disc text-neutral-600">
                  {a.discussedWithSalif && <li>J&apos;en ai discuté avec Salif</li>}
                  {a.ownerAgreed && <li>Le propriétaire a accepté ce prix (accord verbal)</li>}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
    <section className="space-y-4 rounded-[32px] border border-neutral-100 bg-white p-5 text-[#251B16] shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#8E3420]">
        Négociation · équipe uniquement
      </p>
      {state === "error" ? (
        <p className="text-sm text-red-700">
          Impossible de charger l&apos;échelle de prix. Rechargez la page.
        </p>
      ) : !ladder ? (
        <div className="space-y-1 rounded-2xl bg-[#F3EBE2] p-4">
          <p className="text-sm font-bold text-neutral-900">Prix du propriétaire non renseigné</p>
          <p className="text-sm text-[#72584B]">
            Renseignez-le dans le mandat pour voir l&apos;échelle de prix.
          </p>
        </div>
      ) : (
        <>
          <Simulator ladder={ladder} />
          <Approvals ladder={ladder} />
        </>
      )}
    </section>
  );
}
