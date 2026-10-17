export type ListingPaymentMetadata = Record<string, unknown>;

export type ExpectedListingPayment = {
  tierId: string | null;
  addOns: string[];
  frequency: string;
  monthlyRent: number;
};

function normalizedStringSet(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((item): item is string => typeof item === "string")),
  ].sort();
}

export function listingPaymentAddOns(
  metadata: ListingPaymentMetadata,
): string[] {
  const snakeCaseAddOns = normalizedStringSet(metadata.add_ons);
  return snakeCaseAddOns.length > 0
    ? snakeCaseAddOns
    : normalizedStringSet(metadata.addOns);
}

export function listingPaymentMatches(
  metadata: ListingPaymentMetadata,
  expected: ExpectedListingPayment,
): boolean {
  const paidAddOns = listingPaymentAddOns(metadata);
  const paidTier =
    typeof metadata.tier_id === "string" ? metadata.tier_id : null;
  const paidFrequency =
    typeof metadata.frequence === "string" ? metadata.frequence : null;
  const paidMonthlyRent = Number(metadata.monthlyRent);

  return (
    paidTier !== null &&
    paidTier === expected.tierId &&
    JSON.stringify(paidAddOns) ===
      JSON.stringify(normalizedStringSet(expected.addOns)) &&
    paidFrequency !== null &&
    paidFrequency === expected.frequency &&
    Number.isFinite(paidMonthlyRent) &&
    paidMonthlyRent === expected.monthlyRent
  );
}
