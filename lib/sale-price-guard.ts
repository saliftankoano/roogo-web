// Guard for changes to the PUBLIC price of a sale listing (properties.price).
//
// Once a v3 mandate is signed, the public price must stay on the approved ladder
// (Salif, 2026-09-27): staff may set any price down to the team floor (+15%);
// between the team floor and the hard floor (+10%) only a founder may; below the
// hard floor is refused. Listings without a signed v3 mandate are not checked
// here (their price is a placeholder until signing, or a legacy v2 price).

import { priceLadder, type SaleEconomicsSnapshot } from "@/lib/sale-economics";

type LadderSnapshot = Pick<
  SaleEconomicsSnapshot,
  | "listingMarkupPct"
  | "targetMarkupPct"
  | "teamFloorMarkupPct"
  | "hardFloorMarkupPct"
>;

export type SalePriceDecision =
  | { ok: true }
  | { ok: false; status: 403 | 422; error: string };

function fcfa(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

/** Pure decision: can this user set the public price of a signed v3 sale? */
export function evaluateSalePriceChange(params: {
  newPrice: number;
  sellerNetPrice: number;
  snapshot: LadderSnapshot;
  isFounder: boolean;
}): SalePriceDecision {
  const { newPrice, sellerNetPrice, snapshot, isFounder } = params;
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { ok: false, status: 422, error: "Prix invalide." };
  }
  const { exact } = priceLadder(sellerNetPrice, snapshot);
  if (newPrice < exact.hardFloor) {
    return {
      ok: false,
      status: 422,
      error: `Prix refusé : le minimum absolu pour ce bien est ${fcfa(exact.hardFloor)}.`,
    };
  }
  if (newPrice < exact.teamFloor && !isFounder) {
    return {
      ok: false,
      status: 403,
      error: `Un prix sous ${fcfa(exact.teamFloor)} demande l'accord de Salif.`,
    };
  }
  return { ok: true };
}
