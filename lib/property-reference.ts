// Short public reference code of a listing: VEN-014 (sale) or LOC-007
// (rental). The database assigns it once at insert (migration 088) and never
// changes it. This file only reads and checks codes; it never invents one.

export type PropertyReferenceKind = "vente" | "location";

const REFERENCE_PATTERN = /^(VEN|LOC)-(\d{3,})$/;

/** True when the value looks like a code the database could have assigned. */
export function isPropertyReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

/** "vente" for VEN-, "location" for LOC-, null for anything else. */
export function propertyReferenceKind(
  value: unknown,
): PropertyReferenceKind | null {
  if (!isPropertyReference(value)) return null;
  return value.startsWith("VEN-") ? "vente" : "location";
}

/**
 * Normalises what someone types into a search box ("ven14", "VEN 014",
 * "loc-7") to the stored shape, or null when it is not a code.
 */
export function normalizePropertyReferenceQuery(input: string): string | null {
  const match = input
    .trim()
    .toUpperCase()
    .match(/^(VEN|LOC)[\s-]*(\d{1,6})$/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(3, "0")}`;
}
