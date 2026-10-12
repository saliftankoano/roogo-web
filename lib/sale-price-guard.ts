// Guard for changes to the PUBLIC price of a sale listing (properties.price).
//
// The public price must stay on the approved ladder above the owner's price:
// staff may set any price above the hard floor (+10%) on their own; a price AT
// the floor (up to its display value, rounded up to 50,000 FCFA) needs a
// founder (Salif, 2026-10-12); below the floor is refused for everyone. The owner's price is the signed mandate's
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
  const { exact, display } = priceLadder(ownerPrice, pcts);
  if (newPrice < exact.hardFloor) {
    return {
      ok: false,
      status: 422,
      error: `Prix refusé : le minimum absolu pour ce bien est ${fcfa(exact.hardFloor)}.`,
    };
  }
  if (newPrice <= display.hardFloor && !isFounder) {
    return {
      ok: false,
      status: 403,
      error: `Le prix plancher (${fcfa(display.hardFloor)}) demande l'accord de Salif.`,
    };
  }
  return { ok: true };
}
