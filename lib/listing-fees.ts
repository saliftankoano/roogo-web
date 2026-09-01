export const OWNER_RENT_FEE_RATE_BPS = 700;
export const MONTHLY_FREE_SUCCESS_FEE_RATE_BPS = 5000;

function toWholeXof(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function calculateMonthlyFreeSuccessFee(monthlyRent: unknown): number {
  return Math.round(
    (toWholeXof(monthlyRent) * MONTHLY_FREE_SUCCESS_FEE_RATE_BPS) / 10000,
  );
}

export function calculateOwnerRentAmounts(
  grossRentAmount: unknown,
  feeRateBps = OWNER_RENT_FEE_RATE_BPS,
) {
  const gross = toWholeXof(grossRentAmount);
  const normalizedRate = Math.max(0, Math.round(Number(feeRateBps) || 0));
  const feeAmount = Math.min(
    gross,
    Math.round((gross * normalizedRate) / 10000),
  );

  return {
    grossRentAmount: gross,
    feeRateBps: normalizedRate,
    feeAmount,
    netAmount: gross - feeAmount,
  };
}

export function calculateFirstRentSuccessFeeAmounts(
  grossRentAmount: unknown,
  deferredFeeAmount: unknown,
  feeRateBps = MONTHLY_FREE_SUCCESS_FEE_RATE_BPS,
) {
  const gross = toWholeXof(grossRentAmount);
  const feeAmount = Math.min(gross, toWholeXof(deferredFeeAmount));

  return {
    grossRentAmount: gross,
    feeRateBps: Math.max(0, Math.round(Number(feeRateBps) || 0)),
    feeAmount,
    netAmount: gross - feeAmount,
  };
}
