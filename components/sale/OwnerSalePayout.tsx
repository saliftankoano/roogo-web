"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  formatSaleMillions,
  ownerSimulatorRows,
  type SaleOwnerSimulatorRow,
} from "@/lib/sale-economics";
import type { OwnerSalePayout as Payout } from "@/lib/sale-mandate";
import { roogoMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { SaleSplitBar } from "./SaleSplitBar";
import { SALE_PARTY_COLORS, fcfaFull } from "./saleColors";

// Owner view of their listed sale property (design approved by Salif on
// 2026-10-18): what they receive at Prix affiché, Objectif (open by default)
// and Minimum. Closed rows keep a neutral bar; only the open row is green and
// shows the full split, the notary and helpers being paid by Roogo. Owners
// never see who approves prices (components/sale/owner-sale-copy.test.mjs).

export const OWNER_SCENARIO_NAMES: Record<SaleOwnerSimulatorRow["level"], string> = {
  listing: "Prix affiché",
  target: "Objectif",
  teamFloor: "Minimum",
};

const short = (n: number) => formatSaleMillions(n);

export function OwnerSalePayoutRows({ payout }: { payout: Payout }) {
  const [open, setOpen] = useState(1);
  const rows = useMemo(() => ownerSimulatorRows(payout.ownerPrice, payout), [payout]);
  const maxGets = Math.max(...rows.map((r) => r.breakdown.ownerReceives), 1);

  return (
    <div className="space-y-3">
      <div className="space-y-0.5 text-[13px]">
        <p className="text-[#72584B]">Votre prix : {fcfaFull(payout.ownerPrice)}</p>
        {payout.listingPrice > 0 && (
          <p className="font-bold text-[#4A3424]">En ligne à {fcfaFull(payout.listingPrice)}</p>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-xl font-black leading-tight text-[#251B16]">
          Ce que vous recevez selon le prix de vente final
        </h3>
        <p className="text-[13px] text-[#72584B]">Touchez un prix pour voir le détail.</p>
      </div>
      <ul className="space-y-2">
        {rows.map((r, i) => {
          const b = r.breakdown;
          const isOpen = open === i;
          const delta = b.ownerDelta;
          return (
            <motion.li key={r.level} layout transition={roogoMotion.standard}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className={cn(
                  "flex w-full flex-col gap-2 rounded-[18px] bg-white px-3.5 py-3 text-left text-[#251B16] transition-shadow duration-200",
                  isOpen
                    ? "shadow-[inset_0_0_0_2px_#C96A2E]"
                    : "shadow-[inset_0_0_0_1px_#EADFD3]",
                )}
              >
                <span className="flex w-full items-baseline justify-between gap-2 text-[13px] font-bold text-[#72584B]">
                  <span>{OWNER_SCENARIO_NAMES[r.level]}</span>
                  <span className="whitespace-nowrap">vendu à {short(r.price)}</span>
                </span>
                <span className="flex w-full items-center gap-2.5">
                  <span className="block h-3.5 flex-1 overflow-hidden rounded-full bg-[#F3EBE2]">
                    <motion.span
                      className="block h-full rounded-full"
                      initial={false}
                      animate={{
                        width: `${(b.ownerReceives / maxGets) * 100}%`,
                        backgroundColor: isOpen ? SALE_PARTY_COLORS.owner : "#CDBFB3",
                      }}
                      transition={roogoMotion.deliberate}
                    />
                  </span>
                  <span className="min-w-[82px] whitespace-nowrap text-right text-lg font-black">
                    {short(b.ownerReceives)}
                  </span>
                </span>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.span
                      key="detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={roogoMotion.standard}
                      className="block w-full overflow-hidden"
                    >
                      <span className="flex flex-col gap-1.5 border-t border-[#F0E6DC] pt-1.5">
                        <span className="flex justify-between gap-2 text-sm">
                          <span>Vous recevez</span>
                          <strong className="whitespace-nowrap">{fcfaFull(b.ownerReceives)}</strong>
                        </span>
                        <span
                          className={cn(
                            "text-[13px] font-bold",
                            delta >= -1 ? "text-[#245C33]" : "text-[#8E3420]",
                          )}
                        >
                          {Math.abs(delta) < 1
                            ? "Exactement votre prix"
                            : delta > 0
                              ? `+${short(delta)} de plus que votre prix`
                              : `${short(-delta)} de moins que votre prix`}
                        </span>
                        <SaleSplitBar
                          className="h-2.5 rounded-full bg-white"
                          label={`Sur ${fcfaFull(b.finalPrice)}, vous recevez ${fcfaFull(b.ownerReceives)}`}
                          segments={[
                            { key: "owner", value: b.ownerReceives, color: SALE_PARTY_COLORS.owner },
                            { key: "notary", value: b.notaryFee, color: SALE_PARTY_COLORS.notary },
                            { key: "intermediary", value: b.buyerReferralFee, color: SALE_PARTY_COLORS.intermediary },
                            { key: "sponsor", value: b.sellerReferralFee, color: SALE_PARTY_COLORS.sponsor },
                            { key: "roogo", value: Math.max(0, b.roogoNet), color: SALE_PARTY_COLORS.roogo },
                          ]}
                        />
                        <span className="text-xs text-[#72584B]">
                          Notaire {short(b.notaryFee)} · intermédiaire {short(b.buyerReferralFee)} ·
                          parrain {short(b.sellerReferralFee)}, payés par Roogo · Roogo{" "}
                          {short(b.roogoNet)}
                        </span>
                      </span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </motion.li>
          );
        })}
      </ul>
      <p className="text-xs text-[#72584B]">Plus le bien se vend cher, plus vous recevez.</p>
    </div>
  );
}

/** Loads the owner's payout for one sale listing; renders nothing when the
 * owner's price is unknown or the caller is not the owner. */
export default function OwnerSalePayout({ propertyId }: { propertyId: string }) {
  const [payout, setPayout] = useState<Payout | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/properties/${propertyId}/owner-sale`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404 || res.status === 403) return { payout: null };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { payout: Payout | null };
      })
      .then((data) => {
        if (!cancelled) setPayout(data.payout);
      })
      .catch((error) => console.error("Owner sale payout failed to load:", error));
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  if (!payout) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={roogoMotion.standard}
      className="rounded-[32px] border border-neutral-100 bg-[#F7F7F7] p-6 shadow-sm"
    >
      <OwnerSalePayoutRows payout={payout} />
    </motion.section>
  );
}
