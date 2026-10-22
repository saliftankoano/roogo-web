import type { SaleLadderPcts } from "@/lib/sale-economics";

// Reading percentages stored on sale mandates and sale_economics_config.
// Kept apart from lib/sale-mandate.ts (which talks to Supabase) so it can be
// unit tested.

/**
 * A stored percentage as a number, or NaN when it is missing.
 * `Number(null)` is 0, so a NULL column must be treated as missing explicitly:
 * mandates sent before migration 075 have NULL ladder columns, and reading them
 * as 0 gave a ladder where every rung was "+0 %" (2026-10-18, VEN-023).
 */
export function readPct(value: unknown) {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === "string" && value.trim() === "") return Number.NaN;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export type MandateLadderColumns = {
  listing_markup_pct?: unknown;
  target_markup_pct?: unknown;
  team_floor_markup_pct?: unknown;
  hard_floor_markup_pct?: unknown;
};

/**
 * The ladder snapshotted on a mandate, or null for mandates sent before the
 * ladder existed (missing columns) or holding no usable ladder (a top rung of
 * +0 %). Callers then use the live sale_economics_config ladder.
 */
export function mandateLadderFromRow(
  mandate: MandateLadderColumns,
): SaleLadderPcts | null {
  const pcts = {
    listingMarkupPct: readPct(mandate.listing_markup_pct),
    targetMarkupPct: readPct(mandate.target_markup_pct),
    // 075 column names: see getSaleLadderConfig in lib/sale-mandate.ts.
    referenceMarkupPct: readPct(mandate.team_floor_markup_pct),
    teamFloorMarkupPct: readPct(mandate.hard_floor_markup_pct),
  };
  if (!Object.values(pcts).every(Number.isFinite)) return null;
  if (!(pcts.listingMarkupPct > 0)) return null;
  return pcts;
}

/** Same rule for the commission snapshot: null when either value is missing. */
export function mandateCommissionFromRow(mandate: {
  base_commission_pct?: unknown;
  surplus_split_pct?: unknown;
} | null): { baseCommissionPct: number; surplusSplitPct: number } | null {
  if (!mandate) return null;
  const base = readPct(mandate.base_commission_pct);
  const split = readPct(mandate.surplus_split_pct);
  return Number.isFinite(base) && Number.isFinite(split)
    ? { baseCommissionPct: base, surplusSplitPct: split }
    : null;
}
