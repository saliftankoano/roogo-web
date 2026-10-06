// Spend estimates and the monthly cap check for the Studio.
// Amounts are USD. Cents are rounded up so the shown price is never lower
// than what is recorded.

// Cartesia is billed in credits, not per character. This constant is an
// estimate used for caps and display, NOT an invoice figure. Confirm it
// against the Cartesia dashboard and update it here (one place).
export const CARTESIA_USD_PER_1K_CHARACTERS = 0.03;

export function estimateVoiceoverCostUsd(spokenCharacters: number): number {
  if (!Number.isFinite(spokenCharacters) || spokenCharacters <= 0) return 0;
  const raw = (spokenCharacters / 1000) * CARTESIA_USD_PER_1K_CHARACTERS;
  return Math.ceil(raw * 1000) / 1000;
}

export type SpendCheck =
  | { ok: true; remainingAfterUsd: number }
  | { ok: false; remainingUsd: number };

export function canSpend(
  usedThisMonthUsd: number,
  estimateUsd: number,
  capUsd: number,
): SpendCheck {
  const remaining = Math.max(0, capUsd - usedThisMonthUsd);
  // Compare in thousandths of a dollar to avoid floating point drift.
  const needed = Math.round(estimateUsd * 1000);
  const available = Math.round(remaining * 1000);
  if (needed > available) {
    return { ok: false, remainingUsd: remaining };
  }
  return { ok: true, remainingAfterUsd: (available - needed) / 1000 };
}

/** The cost a user saw is acceptable if the server price is not higher. */
export function acknowledgedCoversServerPrice(
  acknowledgedUsd: number,
  serverUsd: number,
): boolean {
  return Math.round(acknowledgedUsd * 1000) >= Math.round(serverUsd * 1000);
}

export function startOfMonthIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}
