export type MoveInPaymentBreakdown = {
  monthlyRent: number;
  cautionMois: number;
  loyerAvanceMois: number;
  cautionAmount: number;
  advanceRentAmount: number;
  totalAmount: number;
};

function toWholeNumber(value: unknown, fallback: number): number {
  const numeric =
    typeof value === "string" ? Number(value.replace(/[^0-9]/g, "")) : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.trunc(numeric);
}

export function getMoveInPaymentBreakdown({
  monthlyRent,
  cautionMois,
  loyerAvanceMois,
}: {
  monthlyRent: unknown;
  cautionMois?: unknown;
  loyerAvanceMois?: unknown;
}): MoveInPaymentBreakdown {
  const rent = Math.max(0, toWholeNumber(monthlyRent, 0));
  const caution = Math.min(12, Math.max(0, toWholeNumber(cautionMois, 0)));
  const advance = Math.min(12, Math.max(1, toWholeNumber(loyerAvanceMois, 1)));

  return {
    monthlyRent: rent,
    cautionMois: caution,
    loyerAvanceMois: advance,
    cautionAmount: rent * caution,
    advanceRentAmount: rent * advance,
    totalAmount: rent * (caution + advance),
  };
}
