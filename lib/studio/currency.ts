// Studio prices are stored and capped in USD (what the provider bills) and
// shown to staff in FCFA first, with a toggle to USD.

// Approximate rate. Rounded up on purpose so the FCFA shown never understates
// the cost. Override with STUDIO_FCFA_PER_USD on the server.
export const DEFAULT_FCFA_PER_USD = 600;

export type StudioCurrency = "FCFA" | "USD";

export function fcfaPerUsd(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_FCFA_PER_USD;
}

export function usdToFcfa(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  // Round up to a whole franc: never show less than the real cost.
  return Math.ceil(usd * rate - 1e-9);
}

const fcfaFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function formatMoney(
  usd: number,
  currency: StudioCurrency,
  rate: number,
): string {
  if (currency === "FCFA") {
    return `${fcfaFormat.format(usdToFcfa(usd, rate))} FCFA`;
  }
  return usd > 0 && usd < 1
    ? `${usd.toFixed(3).replace(/0$/, "")} $`
    : `${usd.toFixed(2)} $`;
}
