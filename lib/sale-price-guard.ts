// Guard for changes to the PUBLIC price of a sale listing (properties.price).
//
// Rule (Salif, 2026-10-17, replaces the 2026-10-12 hard stop): the team decides
// any price from the +10% team floor (inclusive, exact whole FCFA) up to the
// +30% listing price. A price below +10% is allowed only for a founder: staff
// get 403 ("accord de Salif"), the founder's own change is the approval and the
// caller records it (founderApproved: true). The owner's price is the signed
// mandate's desired_price, or the private asking price before a mandate exists.

import {
  priceLadder,
  salePriceApproval,
  type SaleLadderPcts,
} from "@/lib/sale-economics";

export type SalePriceDecision =
  | {
      ok: true;
      /** True when the price is below the +10% team floor and the acting user
       * is a founder: the change is the founder's approval and must be
       * recorded by the caller. */
      founderApproved?: boolean;
    }
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
  if (salePriceApproval(newPrice, ownerPrice, pcts) === "team") {
    return { ok: true };
  }
  if (!isFounder) {
    const { display } = priceLadder(ownerPrice, pcts);
    return {
      ok: false,
      status: 403,
      error: `L'équipe décide à partir de ${fcfa(display.teamFloor)}. En dessous, le prix demande l'accord de Salif.`,
    };
  }
  return { ok: true, founderApproved: true };
}
