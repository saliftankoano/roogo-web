import {
  DEFAULT_SALE_ECONOMICS,
  formatSalePct,
  payoutTable,
  type SaleLadderLevel,
  type SalePayoutRow,
} from "@/lib/sale-economics";

const LEVEL_LABELS: Record<SaleLadderLevel | "ownerPrice", string> = {
  listing: "Prix affiché",
  target: "Objectif",
  reference: "Repère",
  teamFloor: "Minimum équipe",
  ownerPrice: "Prix du propriétaire",
};

/** A row as shown here: the staff table (with Roogo's commission) or the
 * owner scenarios stored on a mandate card (without it). */
type DisplayRow = Omit<SalePayoutRow, "level" | "roogoCommission"> & {
  level: SaleLadderLevel | "ownerPrice";
  roogoCommission?: number;
};

function fmt(n: number) {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

/** Reads a payout table stored in a mandate card's metadata, or null. */
export function payoutRowsFromMeta(value: unknown): DisplayRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter(
    (r): r is DisplayRow =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as DisplayRow).price === "number" &&
      typeof (r as DisplayRow).ownerReceives === "number" &&
      typeof (r as DisplayRow).level === "string",
  );
  return rows.length > 0 ? rows : null;
}

/** Preview for a typed owner price, with the approved default ladder and the
 * live commission percentages. The sent mandate snapshots the live ladder. */
export function previewPayoutRows(
  ownerPrice: number,
  baseCommissionPct: number,
  surplusSplitPct: number,
) {
  if (!Number.isFinite(ownerPrice) || ownerPrice <= 0) return null;
  return payoutTable(ownerPrice, {
    ...DEFAULT_SALE_ECONOMICS,
    baseCommissionPct,
    surplusSplitPct,
  });
}

export function SalePayoutTable({ rows }: { rows: DisplayRow[] }) {
  const showRoogo = rows.every((row) => typeof row.roogoCommission === "number");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs tabular-nums">
        <thead className="text-neutral-500">
          <tr>
            <th className="py-1 pr-3 font-semibold">Niveau</th>
            <th className="py-1 pr-3 text-right font-semibold">Prix de vente</th>
            <th className="py-1 pr-3 text-right font-semibold">Propriétaire reçoit</th>
            {showRoogo && <th className="py-1 text-right font-semibold">Roogo</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.level} className="border-t border-neutral-200">
              <td className="py-1 pr-3">
                {LEVEL_LABELS[row.level] ?? row.level}{" "}
                <span className="text-neutral-400">
                  (+{formatSalePct(row.markupPct)})
                </span>
              </td>
              <td className="py-1 pr-3 text-right">{fmt(row.price)}</td>
              <td className="py-1 pr-3 text-right font-semibold text-neutral-900">
                {fmt(row.ownerReceives)}
              </td>
              {showRoogo && (
                <td className="py-1 text-right">{fmt(row.roogoCommission ?? 0)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
