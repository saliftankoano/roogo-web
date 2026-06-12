/**
 * PawaPay Transaction Limits
 *
 * Conservative limits used for Burkina Faso, Côte d'Ivoire, and Senegal.
 * Start with min 100 / max 2,000,000 XOF for all XOF correspondents.
 * Verify exact per-correspondent limits against PawaPay active config and
 * update these constants when confirmed.
 */

type DepositLimits = { min: number; max: number };

export const PAYMENT_LIMITS: Record<string, { deposit: DepositLimits }> = {
  // Burkina Faso
  MOOV_BFA: { deposit: { min: 100, max: 2_000_000 } },
  ORANGE_BFA: { deposit: { min: 1, max: 2_000_000 } },
  // Côte d'Ivoire
  ORANGE_CIV: { deposit: { min: 100, max: 2_000_000 } },
  MTN_MOMO_CIV: { deposit: { min: 100, max: 2_000_000 } },
  WAVE_CIV: { deposit: { min: 100, max: 2_000_000 } },
  // Sénégal
  ORANGE_SEN: { deposit: { min: 100, max: 2_000_000 } },
  FREE_SEN: { deposit: { min: 100, max: 2_000_000 } },
  WAVE_SEN: { deposit: { min: 100, max: 2_000_000 } },
};

/**
 * Get the minimum deposit amount for a given correspondent.
 * Falls back to the highest min across all correspondents when unspecified.
 */
export function getMinDepositAmount(correspondent?: string): number {
  if (correspondent && PAYMENT_LIMITS[correspondent]) {
    return PAYMENT_LIMITS[correspondent].deposit.min;
  }
  return Math.max(...Object.values(PAYMENT_LIMITS).map((l) => l.deposit.min));
}

/**
 * Get the maximum deposit amount for a given correspondent.
 * Falls back to the lowest max across all correspondents when unspecified.
 */
export function getMaxDepositAmount(correspondent?: string): number {
  if (correspondent && PAYMENT_LIMITS[correspondent]) {
    return PAYMENT_LIMITS[correspondent].deposit.max;
  }
  return Math.min(...Object.values(PAYMENT_LIMITS).map((l) => l.deposit.max));
}

/**
 * Check whether an amount is within the deposit limits for a correspondent.
 * When no correspondent is given, validates against the safest cross-provider limits.
 */
export function isValidDepositAmount(
  amount: number,
  correspondent?: string,
): boolean {
  if (amount <= 0) return false;
  const min = getMinDepositAmount(correspondent);
  const max = getMaxDepositAmount(correspondent);
  return amount >= min && amount <= max;
}

// Legacy convenience exports (BFA-only) — kept for callers that haven't been updated
export function getMinimumDepositAmount(): number {
  return getMinDepositAmount();
}
export function getMaximumDepositAmount(): number {
  return getMaxDepositAmount();
}

export const MIN_DEPOSIT_AMOUNT = getMinDepositAmount();
export const MAX_DEPOSIT_AMOUNT = getMaxDepositAmount();
