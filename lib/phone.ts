import {
  parsePhoneNumber,
  isValidPhoneNumber,
  type CountryCode,
} from "libphonenumber-js/min";

/**
 * Normalize a national phone number to E.164 for the given ISO country code.
 * Returns null if the number is not valid for that country.
 */
export function normalizePhone(national: string, iso: string): string | null {
  if (!national || !iso) return null;
  try {
    const parsed = parsePhoneNumber(national, iso as CountryCode);
    if (parsed?.isValid()) return parsed.format("E.164");
  } catch {
    // invalid input
  }
  return null;
}

/**
 * Check whether a national phone number is valid for the given ISO country code.
 */
export function isValidPhone(national: string, iso: string): boolean {
  if (!national || !iso) return false;
  try {
    return isValidPhoneNumber(national, iso as CountryCode);
  } catch {
    return false;
  }
}

/**
 * Parse a stored E.164 phone number into its ISO country code and national number.
 * Returns null if the number cannot be parsed or the country is not recognised.
 */
export function parseStoredPhone(
  e164: string | null | undefined,
): { iso: string; national: string } | null {
  if (!e164) return null;
  try {
    const parsed = parsePhoneNumber(e164);
    if (parsed?.country) {
      return {
        iso: parsed.country as string,
        national: parsed.nationalNumber as string,
      };
    }
  } catch {
    // not a valid E.164
  }
  return null;
}

/**
 * Check whether a stored E.164 phone number is valid for any country.
 */
export function isValidStoredPhone(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = parseStoredPhone(value);
  if (!parsed) return false;
  return isValidPhone(parsed.national, parsed.iso);
}
