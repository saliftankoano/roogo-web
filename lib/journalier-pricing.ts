export type CautionType = "aucune" | "pourcentage" | "fixe" | null;

export const JOURNALIER_RENTER_SERVICE_FEE_BPS = 1000;
export const JOURNALIER_OWNER_COMMISSION_BPS = 1000;
export const JOURNALIER_CAUTION_CAP_BPS = 5000;
export const JOURNALIER_CAUTION_ABSOLUTE_CAP = 50_000;
export const JOURNALIER_LISTING_PUBLICATION_FEE = 5_000;

export interface JournalierPricingInput {
  nightlyRate: number;
  nights: number;
  cautionType: CautionType;
  cautionValeur: number | null | undefined;
}

export interface JournalierPricingBreakdown {
  nightlyRate: number;
  nights: number;
  stayAmount: number;
  originalCautionAmount: number;
  cautionAmount: number;
  cautionCapAmount: number;
  renterServiceFeeBps: number;
  renterServiceFeeAmount: number;
  ownerCommissionBps: number;
  ownerCommissionAmount: number;
  ownerNetAmount: number;
  totalAmount: number;
  cautionType: CautionType;
  cautionValeur: number | null;
}

export function nightsBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.getTime() - start.getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

export function computeJournalierPricing(
  input: JournalierPricingInput,
): JournalierPricingBreakdown {
  const nightlyRate = Math.max(0, Math.round(Number(input.nightlyRate) || 0));
  const nights = Math.max(0, Math.floor(Number(input.nights) || 0));
  const stayAmount = nightlyRate * nights;
  const cautionValeur =
    input.cautionValeur == null
      ? null
      : Math.max(0, Math.round(Number(input.cautionValeur)));

  let originalCautionAmount = 0;
  if (input.cautionType === "fixe" && cautionValeur != null) {
    originalCautionAmount = cautionValeur;
  } else if (input.cautionType === "pourcentage" && cautionValeur != null) {
    originalCautionAmount = Math.round((stayAmount * cautionValeur) / 100);
  }
  const cautionCapAmount = Math.min(
    Math.round((stayAmount * JOURNALIER_CAUTION_CAP_BPS) / 10000),
    JOURNALIER_CAUTION_ABSOLUTE_CAP,
  );
  const cautionAmount = Math.min(originalCautionAmount, cautionCapAmount);
  const renterServiceFeeAmount = Math.round(
    (stayAmount * JOURNALIER_RENTER_SERVICE_FEE_BPS) / 10000,
  );
  const ownerCommissionAmount = Math.round(
    (stayAmount * JOURNALIER_OWNER_COMMISSION_BPS) / 10000,
  );
  const ownerNetAmount = Math.max(0, stayAmount - ownerCommissionAmount);

  return {
    nightlyRate,
    nights,
    stayAmount,
    originalCautionAmount,
    cautionAmount,
    cautionCapAmount,
    renterServiceFeeBps: JOURNALIER_RENTER_SERVICE_FEE_BPS,
    renterServiceFeeAmount,
    ownerCommissionBps: JOURNALIER_OWNER_COMMISSION_BPS,
    ownerCommissionAmount,
    ownerNetAmount,
    totalAmount: stayAmount + cautionAmount + renterServiceFeeAmount,
    cautionType: input.cautionType ?? "aucune",
    cautionValeur,
  };
}
