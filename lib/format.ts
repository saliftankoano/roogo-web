/**
 * Single number formatter for the web app.
 *
 * Mirrors the mobile app's helpers (roogo/utils/formatting.ts and
 * roogo/lib/i18n.tsx formatNumber / formatCurrencyValue / parsePrice) so both
 * surfaces write numbers the same way: Intl.NumberFormat in French, no
 * decimals, thousands separated by the locale's narrow no-break space, and the
 * currency as a trailing " FCFA" label.
 *
 * The older helpers (lib/utils.ts formatPrice, lib/visites-3d.ts formatFCFA,
 * lib/rental-period.ts formatXofAmount, lib/notification-copy.ts
 * formatXofAmount) are to be migrated to this module.
 */

export type FormatLocale = "fr" | "en";

export type CurrencyLabel = "FCFA" | "XOF";

export function getLanguageTag(locale: FormatLocale): string {
  return locale === "en" ? "en-US" : "fr-FR";
}

/**
 * Formats a number with the locale's thousands separator and no decimals.
 * Strings are accepted and cleaned of spaces and commas first.
 * Example: 1000000 -> "1 000 000" (with U+202F between groups in French).
 */
export function formatNumber(
  value: string | number | undefined | null,
  locale: FormatLocale = "fr",
): string {
  if (value === undefined || value === null || value === "") return "";
  const numericValue =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/\s/g, "").replace(/,/g, ""));
  if (Number.isNaN(numericValue)) return String(value);
  return new Intl.NumberFormat(getLanguageTag(locale), {
    maximumFractionDigits: 0,
  }).format(numericValue);
}

/**
 * Formats an amount with the currency label after a space.
 * Example: 1000000 -> "1 000 000 FCFA". Empty input gives "".
 */
export function formatCurrency(
  value: string | number | undefined | null,
  locale: FormatLocale = "fr",
  label: CurrencyLabel = "FCFA",
): string {
  const formatted = formatNumber(value, locale);
  return formatted ? `${formatted} ${label}` : "";
}

/**
 * Parses a displayed price back to an integer, ignoring spaces and any
 * non-digit character. Example: "1 000 000 FCFA" -> 1000000.
 */
export function parsePrice(text: string): number | undefined {
  if (!text) return undefined;
  const cleanString = text.replace(/\s/g, "").replace(/[^0-9]/g, "");
  const number = parseInt(cleanString, 10);
  return Number.isNaN(number) ? undefined : number;
}
