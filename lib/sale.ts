// Shared constants for the property-selling feature (Roogo Sell, broker model).
// Keep in sync with the mobile mirror at roogo/constants/sale.ts.
//
// Economics v3 (migration 075, approved 2026-09-27): the owner names the net
// amount they receive, and it is guaranteed. Roogo lists above it using the price
// ladder in lib/sale-economics.ts; the margin pays the notary, any referrers and
// Roogo. The seller never sees Roogo's exact public listing price
// (properties.price). Bypass clause: a sale within the bypass window to a buyer
// Roogo introduced owes Roogo a percentage of the sale price.
//
// Mandates signed before v3 keep economics_version = 'v2' (desired price + base
// commission + surplus split, migration 050) and their chat cards keep rendering
// with the v2 layout. See lib/sale-mandate.ts and migrations 042, 050, 075.

// Bump when the seller-facing mandate terms text changes, so each signed mandate
// records exactly which version was agreed to.
export const MANDATE_TERMS_VERSION = "2026-10-v3";

// Default exclusivity period Roogo proposes on a mandate, in days.
export const DEFAULT_MANDATE_EXCLUSIVITY_DAYS = 90;

// Fallbacks for the seller-facing bypass terms when listing_config cannot be read.
// The binding values are the ones snapshotted onto each mandate.
export const DEFAULT_SALE_BYPASS_MONTHS = 12;
export const DEFAULT_SALE_BYPASS_FEE_PCT = 0.1;

/** "10 %" style French percentage from a decimal fraction. */
export function formatSalePct(fraction: number) {
  const pct = Number((fraction * 100).toFixed(1));
  return `${pct.toLocaleString("fr-FR")} %`;
}

export type MandateTermsV3Params = {
  /** Pre-formatted amount, e.g. "35 000 000 FCFA". */
  netPrice: string;
  exclusivityDays: number;
  bypassMonths: number;
  /** Pre-formatted percentage, e.g. "10 %". */
  bypassFeePct: string;
};

// LEGAL REVIEW REQUIRED: this terms text needs a read by someone who knows
// Burkina Faso contract law before the first real v3 mandate is sent. Any wording
// change must bump MANDATE_TERMS_VERSION here and in roogo/constants/sale.ts.
// Keep the web and mobile copies identical.
export function mandateTermsV3(params: MandateTermsV3Params): string[] {
  return [
    `Vous confiez à Roogo la vente de ce bien, en exclusivité pendant ${params.exclusivityDays} jours à compter de la signature de ce mandat.`,
    `Vous recevez ${params.netPrice} net à la vente. Ce montant est garanti.`,
    "Roogo fixe le prix de vente au-dessus de ce montant. La différence couvre le notaire, les éventuels apporteurs d'affaires et la rémunération de Roogo.",
    `Si le bien est vendu dans les ${params.bypassMonths} mois suivant la signature de ce mandat à un acheteur présenté par Roogo, même sans passer par Roogo, des frais de ${params.bypassFeePct} du prix de vente sont dus à Roogo.`,
    "La signature finale de la vente et le paiement se font chez le notaire ou au bureau Roogo.",
    `Version des conditions : ${MANDATE_TERMS_VERSION}.`,
  ];
}
