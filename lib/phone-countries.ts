/**
 * Supported countries for contact phone numbers.
 * Covers Burkina Faso (default) + diaspora countries.
 */
export type PhoneCountry = {
  iso: string;
  dialCode: string;
  name: string;
  nameFr: string;
  flag: string;
  /** Expected national number length(s). Used for formatting guidance. */
  nationalLength: number[];
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "BF", dialCode: "226", name: "Burkina Faso", nameFr: "Burkina Faso", flag: "🇧🇫", nationalLength: [8] },
  { iso: "BE", dialCode: "32", name: "Belgium", nameFr: "Belgique", flag: "🇧🇪", nationalLength: [9] },
  { iso: "CA", dialCode: "1", name: "Canada", nameFr: "Canada", flag: "🇨🇦", nationalLength: [10] },
  { iso: "CI", dialCode: "225", name: "Côte d'Ivoire", nameFr: "Côte d'Ivoire", flag: "🇨🇮", nationalLength: [10] },
  { iso: "FR", dialCode: "33", name: "France", nameFr: "France", flag: "🇫🇷", nationalLength: [9] },
  { iso: "IT", dialCode: "39", name: "Italy", nameFr: "Italie", flag: "🇮🇹", nationalLength: [10] },
  { iso: "ML", dialCode: "223", name: "Mali", nameFr: "Mali", flag: "🇲🇱", nationalLength: [8] },
  { iso: "NE", dialCode: "227", name: "Niger", nameFr: "Niger", flag: "🇳🇪", nationalLength: [8] },
  { iso: "SN", dialCode: "221", name: "Senegal", nameFr: "Sénégal", flag: "🇸🇳", nationalLength: [9] },
  { iso: "US", dialCode: "1", name: "United States", nameFr: "États-Unis", flag: "🇺🇸", nationalLength: [10] },
];

export const DEFAULT_PHONE_COUNTRY_ISO = "BF";

export function getPhoneCountry(iso: string): PhoneCountry {
  return PHONE_COUNTRIES.find((c) => c.iso === iso) ?? PHONE_COUNTRIES[0];
}
