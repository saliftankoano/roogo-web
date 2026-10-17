// Guard for changes to the PUBLIC price of a sale listing (properties.price).
// Rentals never reach it: their price is kept exactly as set.
//
// Rule (Salif, 2026-10-17, replaces the 2026-10-12 hard stop):
// - From the +10% team floor (inclusive, exact whole FCFA) up to +30%: any staff
//   member may set the price ("L'équipe décide").
// - Below +10%: only the founder or the Directeur (staff level "director").
//   The Directeur must confirm "J'en ai discuté avec Salif". Other staff: 403.
// - Below the owner's own price (the owner rethought his price after a verbal
//   yes): founder or Directeur only, with the confirmation "Le propriétaire a
//   accepté ce prix (accord verbal)".
// Every price below +10% is an approval the caller records in
// sale_price_approvals (migration 097) in the same request.

import {
  priceLadder,
  salePriceApproval,
  type SaleLadderPcts,
} from "@/lib/sale-economics";

export type SalePriceConfirmationKey = "discussed_with_salif" | "owner_agreed";

export const SALE_PRICE_CONFIRMATION_LABELS: Record<SalePriceConfirmationKey, string> = {
  discussed_with_salif: "J'en ai discuté avec Salif",
  owner_agreed: "Le propriétaire a accepté ce prix (accord verbal)",
};

export type SalePriceConfirmations = Partial<Record<SalePriceConfirmationKey, boolean>>;

export type SalePriceApprovalRecord = {
  approverLevel: "founder" | "director";
  /** newPrice / ownerPrice - 1, 4 decimals (negative below the owner's price). */
  markupPct: number;
  belowOwnerPrice: boolean;
  discussedWithSalif: boolean;
  ownerAgreed: boolean;
};

export type SalePriceDecision =
  | {
      ok: true;
      /** Set when the price is below +10%: the approval to record. */
      approval?: SalePriceApprovalRecord;
    }
  | {
      ok: false;
      status: 403 | 422;
      error: string;
      code?: "sale_price_confirmation_required";
      /** Confirmations the user must tick before saving again. */
      required?: SalePriceConfirmationKey[];
    };

function fcfa(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

/** Pure decision: can this user set the public price of a sale listing?
 * `staffLevel` is the effective level (lib/staff-access resolveStaffLevel). */
export function evaluateSalePriceChange(params: {
  newPrice: number;
  ownerPrice: number;
  pcts: SaleLadderPcts;
  staffLevel: string | null | undefined;
  confirmations?: SalePriceConfirmations;
}): SalePriceDecision {
  const { newPrice, ownerPrice, pcts, staffLevel } = params;
  const confirmations = params.confirmations ?? {};
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { ok: false, status: 422, error: "Prix invalide." };
  }
  if (salePriceApproval(newPrice, ownerPrice, pcts) === "team") {
    return { ok: true };
  }

  const { display } = priceLadder(ownerPrice, pcts);
  if (staffLevel !== "founder" && staffLevel !== "director") {
    return {
      ok: false,
      status: 403,
      error: `L'équipe décide à partir de ${fcfa(display.teamFloor)}. En dessous, le prix demande l'accord de Salif : seuls Salif ou le Directeur peuvent l'enregistrer.`,
    };
  }

  const belowOwnerPrice = newPrice < ownerPrice;
  const required: SalePriceConfirmationKey[] = [];
  if (staffLevel === "director" && confirmations.discussed_with_salif !== true) {
    required.push("discussed_with_salif");
  }
  if (belowOwnerPrice && confirmations.owner_agreed !== true) {
    required.push("owner_agreed");
  }
  if (required.length > 0) {
    return {
      ok: false,
      status: 422,
      code: "sale_price_confirmation_required",
      required,
      error: `Prix sous +10 %${belowOwnerPrice ? " et sous le prix du propriétaire" : ""}. Cochez : ${required
        .map((key) => `« ${SALE_PRICE_CONFIRMATION_LABELS[key]} »`)
        .join(" et ")}.`,
    };
  }

  return {
    ok: true,
    approval: {
      approverLevel: staffLevel,
      markupPct: Math.round((newPrice / ownerPrice - 1) * 10_000) / 10_000,
      belowOwnerPrice,
      discussedWithSalif: confirmations.discussed_with_salif === true,
      ownerAgreed: confirmations.owner_agreed === true,
    },
  };
}
