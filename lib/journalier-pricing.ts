export type CautionType = "aucune" | "pourcentage" | "fixe" | null;

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
  cautionAmount: number;
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

  let cautionAmount = 0;
  if (input.cautionType === "fixe" && cautionValeur != null) {
    cautionAmount = cautionValeur;
  } else if (input.cautionType === "pourcentage" && cautionValeur != null) {
    cautionAmount = Math.round((stayAmount * cautionValeur) / 100);
  }

  return {
    nightlyRate,
    nights,
    stayAmount,
    cautionAmount,
    totalAmount: stayAmount + cautionAmount,
    cautionType: input.cautionType ?? "aucune",
    cautionValeur,
  };
}
