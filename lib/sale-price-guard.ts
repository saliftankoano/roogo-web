// Guard for changes to the PUBLIC price of a sale listing (properties.price).
//
// The public price must stay on the approved ladder above the owner's price
// (Salif, 2026-10-11): staff may set any price down to the team floor (+15%);
// between the team floor and the hard floor (+10%) only a founder may; below the
// hard floor is refused for everyone. The owner's price is the signed mandate's
// desired_price, or the private asking price before a mandate exists.

import { priceLadder, type SaleLadderPcts } from "@/lib/sale-economics";

export type SalePriceDecision =
  | { ok: true }
  | { ok: false; status: 403 | 422; error: string };

function fcfa(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

/** Pure decision: can this user set the public price of a sale listing? */
export function evaluateSalePriceChange(params: {
  newPrice: number;
  ownerPrice: number;
  pcts: SaleLadderPcts;
  isFounder: boolean;
}): SalePriceDecision {
  const { newPrice, ownerPrice, pcts, isFounder } = params;
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { ok: false, status: 422, error: "Prix invalide." };
  }
  const { exact } = priceLadder(ownerPrice, pcts);
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
