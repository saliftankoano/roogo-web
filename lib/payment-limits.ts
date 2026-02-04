/**
 * PawaPay Transaction Limits for Burkina Faso
 * 
 * Official limits from PawaPay API for supported mobile money providers
 */

export const PAYMENT_LIMITS = {
  BFA: {
    country: "BFA",
    currency: "XOF",
    providers: {
      MOOV_BFA: {
        name: "Moov Money",
        deposit: {
          min: 100,
          max: 2_000_000,
        },
        payout: {
          min: 100,
          max: 2_000_000,
        },
        refund: {
          min: 100,
          max: 2_000_000,
        },
      },
      ORANGE_BFA: {
        name: "Orange Money",
        deposit: {
          min: 1,
          max: 2_000_000,
        },
      },
    },
  },
} as const;

/**
 * Get minimum deposit amount across all providers
 * Use this for validation to ensure compatibility with all payment methods
 */
export function getMinimumDepositAmount(): number {
  return Math.max(
    PAYMENT_LIMITS.BFA.providers.MOOV_BFA.deposit.min,
    PAYMENT_LIMITS.BFA.providers.ORANGE_BFA.deposit.min
  );
}

/**
 * Get maximum deposit amount across all providers
 */
export function getMaximumDepositAmount(): number {
  return Math.min(
    PAYMENT_LIMITS.BFA.providers.MOOV_BFA.deposit.max,
    PAYMENT_LIMITS.BFA.providers.ORANGE_BFA.deposit.max
  );
}

/**
 * Validate if an amount is within acceptable deposit limits
 * @param amount - Amount in XOF
 * @param provider - Optional provider to check specific limits
 * @returns true if amount is valid, false otherwise
 */
export function isValidDepositAmount(
  amount: number,
  provider?: "MOOV_BFA" | "ORANGE_BFA"
): boolean {
  if (amount <= 0) return false;

  if (provider) {
    const limits = PAYMENT_LIMITS.BFA.providers[provider].deposit;
    return amount >= limits.min && amount <= limits.max;
  }

  // Check if valid for all providers (safest approach)
  const minAmount = getMinimumDepositAmount();
  const maxAmount = getMaximumDepositAmount();
  return amount >= minAmount && amount <= maxAmount;
}

/**
 * Get validation error message for invalid amount
 */
export function getDepositAmountError(amount: number): string | null {
  const minAmount = getMinimumDepositAmount();
  const maxAmount = getMaximumDepositAmount();

  if (amount < minAmount) {
    return `Le montant minimum est de ${minAmount.toLocaleString()} XOF (requis par Moov Money)`;
  }

  if (amount > maxAmount) {
    return `Le montant maximum est de ${maxAmount.toLocaleString()} XOF`;
  }

  return null;
}

/**
 * Constants for easy reference
 */
export const MIN_DEPOSIT_AMOUNT = getMinimumDepositAmount(); // 100 XOF (Moov limit)
export const MAX_DEPOSIT_AMOUNT = getMaximumDepositAmount(); // 2,000,000 XOF
