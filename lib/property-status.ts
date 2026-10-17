// Listing statuses: their French labels and the rules of the « Vendu » state.
// Pure (no imports) so the browser, the status route and node:test share one
// source.
//
// « Vendu » (migration 093): a sale listing whose deed was signed at the
// notary. Only the Directeur or the Fondateur may set it or take it back
// (the route computes `canDecideSale` with isDirectorOrFounder). 'expired'
// only means the listing is off; it no longer means rented or sold.

export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  en_attente: "En attente",
  en_ligne: "En ligne",
  locked: "Réservé",
  finalized: "Loué",
  expired: "Expirée",
  vendu: "Vendu",
};

export function propertyStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return PROPERTY_STATUS_LABELS[status] ?? status;
}

/** Badge colours on the admin grid and the listing page. */
export const PROPERTY_STATUS_BADGE: Record<string, string> = {
  en_ligne: "bg-green-100/90 text-green-800 border-green-200",
  locked: "bg-primary/90 text-white border-primary/20",
  finalized: "bg-neutral-900 text-white border-neutral-800",
  en_attente: "bg-yellow-100 text-yellow-900 border-yellow-300",
  expired: "bg-neutral-100/90 text-neutral-600 border-neutral-200",
  vendu: "bg-[#1f7ca5] text-white border-[#1f7ca5]",
};

export function propertyStatusBadge(status: string | null | undefined): string {
  return PROPERTY_STATUS_BADGE[status ?? ""] ?? PROPERTY_STATUS_BADGE.expired;
}

export const SOLD_STATUS = "vendu";

const MAX_SOLD_PRICE = 1e13;

function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export type SoldTransitionInput = {
  /** Status asked for. */
  next: string;
  /** Status the listing has now. */
  current: string | null;
  listingType: string | null;
  isTest: boolean | null;
  /** True for the Directeur and the Fondateur (isDirectorOrFounder). */
  canDecideSale: boolean;
  /** Signature date at the notary, YYYY-MM-DD. Required for vendu. */
  soldAt?: unknown;
  /** Optional final price in FCFA. */
  soldPrice?: unknown;
  /** Today in Ouagadougou (UTC), YYYY-MM-DD. */
  todayKey: string;
  actorId: string;
};

export type SoldTransition =
  | { ok: true; fields: Record<string, string | number | null> }
  | { ok: false; status: number; code: string; error: string };

/**
 * What a status change does to the sold fields, or why it is refused.
 * - Setting or leaving vendu: Directeur or Fondateur only (403).
 * - vendu: sale listing (vendre) only, never a test listing, with a valid
 *   signature date that is not in the future; the price is optional.
 * - Leaving vendu clears sold_at, sold_price and sold_by.
 * - Any other change: no sold fields.
 */
export function soldTransition(input: SoldTransitionInput): SoldTransition {
  const entering = input.next === SOLD_STATUS;
  const leaving = input.current === SOLD_STATUS && !entering;
  if (!entering && !leaving) return { ok: true, fields: {} };
  if (!input.canDecideSale) {
    return {
      ok: false,
      status: 403,
      code: "sold_forbidden",
      error: entering
        ? "Seuls le Directeur et le Fondateur marquent un bien comme vendu."
        : "Seuls le Directeur et le Fondateur retirent le statut Vendu.",
    };
  }
  if (leaving) return { ok: true, fields: { sold_at: null, sold_price: null, sold_by: null } };
  if (input.listingType !== "vendre") {
    return { ok: false, status: 400, code: "sold_not_sale", error: "Seule une annonce de vente peut passer en Vendu." };
  }
  if (input.isTest) {
    return { ok: false, status: 400, code: "sold_test_listing", error: "Une annonce de test ne peut pas passer en Vendu." };
  }
  if (!isDayKey(input.soldAt)) {
    return { ok: false, status: 400, code: "sold_date_required", error: "Donnez la date de signature chez le notaire." };
  }
  if (input.soldAt > input.todayKey) {
    return { ok: false, status: 400, code: "sold_date_future", error: "La date de signature ne peut pas être dans le futur." };
  }
  let price: number | null = null;
  if (input.soldPrice != null && input.soldPrice !== "") {
    const raw = typeof input.soldPrice === "string" ? input.soldPrice.replace(/\s/g, "") : input.soldPrice;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > MAX_SOLD_PRICE) {
      return { ok: false, status: 400, code: "sold_price_invalid", error: "Le prix de vente doit être un nombre positif en FCFA." };
    }
    price = Math.round(n);
  }
  return {
    ok: true,
    fields: { sold_at: `${input.soldAt}T00:00:00.000Z`, sold_price: price, sold_by: input.actorId },
  };
}
