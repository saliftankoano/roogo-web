/**
 * Country lookup for the signup-location map.
 *
 * react-simple-maps uses world-atlas TopoJSON which keys countries by ISO numeric.
 * Our user records carry ISO alpha-2 (from Clerk's geoIP). We also occasionally
 * see English country names ("United States") instead of codes ("US"), so we
 * normalize via NAME_TO_ALPHA2 below.
 *
 * Focus list: Burkina Faso, neighbors, and common diaspora destinations.
 * Anything outside this list still gets counted — it just won't be highlighted
 * on the world choropleth (we'll group it under "Autres").
 */

export type CountryEntry = {
  alpha2: string;
  numeric: string; // 3-digit ISO 3166-1 numeric (string, with leading zeros)
  fr: string;
};

export const COUNTRIES: CountryEntry[] = [
  // Burkina + neighbors
  { alpha2: "BF", numeric: "854", fr: "Burkina Faso" },
  { alpha2: "CI", numeric: "384", fr: "Côte d'Ivoire" },
  { alpha2: "ML", numeric: "466", fr: "Mali" },
  { alpha2: "NE", numeric: "562", fr: "Niger" },
  { alpha2: "GH", numeric: "288", fr: "Ghana" },
  { alpha2: "TG", numeric: "768", fr: "Togo" },
  { alpha2: "BJ", numeric: "204", fr: "Bénin" },
  { alpha2: "SN", numeric: "686", fr: "Sénégal" },
  { alpha2: "GN", numeric: "324", fr: "Guinée" },
  { alpha2: "NG", numeric: "566", fr: "Nigeria" },

  // Diaspora — Americas
  { alpha2: "US", numeric: "840", fr: "États-Unis" },
  { alpha2: "CA", numeric: "124", fr: "Canada" },
  { alpha2: "BR", numeric: "076", fr: "Brésil" },

  // Diaspora — Europe
  { alpha2: "FR", numeric: "250", fr: "France" },
  { alpha2: "BE", numeric: "056", fr: "Belgique" },
  { alpha2: "CH", numeric: "756", fr: "Suisse" },
  { alpha2: "DE", numeric: "276", fr: "Allemagne" },
  { alpha2: "IT", numeric: "380", fr: "Italie" },
  { alpha2: "ES", numeric: "724", fr: "Espagne" },
  { alpha2: "GB", numeric: "826", fr: "Royaume-Uni" },
  { alpha2: "NL", numeric: "528", fr: "Pays-Bas" },
  { alpha2: "SE", numeric: "752", fr: "Suède" },
  { alpha2: "NO", numeric: "578", fr: "Norvège" },
  { alpha2: "PT", numeric: "620", fr: "Portugal" },

  // Other notable
  { alpha2: "MA", numeric: "504", fr: "Maroc" },
  { alpha2: "TN", numeric: "788", fr: "Tunisie" },
  { alpha2: "DZ", numeric: "012", fr: "Algérie" },
  { alpha2: "CM", numeric: "120", fr: "Cameroun" },
  { alpha2: "GA", numeric: "266", fr: "Gabon" },
  { alpha2: "CG", numeric: "178", fr: "Congo" },
  { alpha2: "CD", numeric: "180", fr: "République démocratique du Congo" },
  { alpha2: "AE", numeric: "784", fr: "Émirats arabes unis" },
  { alpha2: "SA", numeric: "682", fr: "Arabie saoudite" },
  { alpha2: "CN", numeric: "156", fr: "Chine" },
  { alpha2: "JP", numeric: "392", fr: "Japon" },
  { alpha2: "IN", numeric: "356", fr: "Inde" },
  { alpha2: "AU", numeric: "036", fr: "Australie" },
];

// Map ISO numeric (string) → alpha-2, used to look up our counts from a topojson feature
export const NUMERIC_TO_ALPHA2: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.numeric, c.alpha2]),
);

// Map alpha-2 → French display name
export const ALPHA2_TO_FR: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.alpha2, c.fr]),
);

// Common full-name → alpha-2 normalizations (Clerk sometimes returns names instead of codes)
const NAME_TO_ALPHA2_RAW: Record<string, string> = {
  "burkina faso": "BF",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  france: "FR",
  canada: "CA",
  "côte d'ivoire": "CI",
  "cote d'ivoire": "CI",
  "ivory coast": "CI",
  mali: "ML",
  niger: "NE",
  ghana: "GH",
  togo: "TG",
  benin: "BJ",
  bénin: "BJ",
  senegal: "SN",
  sénégal: "SN",
  guinea: "GN",
  guinée: "GN",
  nigeria: "NG",
  brazil: "BR",
  brésil: "BR",
  belgium: "BE",
  belgique: "BE",
  switzerland: "CH",
  suisse: "CH",
  germany: "DE",
  allemagne: "DE",
  italy: "IT",
  italie: "IT",
  spain: "ES",
  espagne: "ES",
  "united kingdom": "GB",
  uk: "GB",
  netherlands: "NL",
  "pays-bas": "NL",
  morocco: "MA",
  maroc: "MA",
  tunisia: "TN",
  tunisie: "TN",
  algeria: "DZ",
  algérie: "DZ",
  cameroon: "CM",
  cameroun: "CM",
  gabon: "GA",
  congo: "CG",
  "democratic republic of the congo": "CD",
  "united arab emirates": "AE",
  "saudi arabia": "SA",
  china: "CN",
  chine: "CN",
  japan: "JP",
  japon: "JP",
  india: "IN",
  inde: "IN",
  australia: "AU",
  australie: "AU",
};

/**
 * Normalize a Clerk-supplied country value (alpha-2 OR full English/French name)
 * to a canonical ISO alpha-2 uppercase code, or null if unrecognized.
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  return NAME_TO_ALPHA2_RAW[lower] ?? null;
}

/**
 * Lat/lng of major Burkina Faso cities, used to render pins when the user
 * drills into BF on the map. Strings normalized lower-case for matching.
 */
export const BF_CITY_COORDS: Record<string, [number, number]> = {
  // [longitude, latitude] — react-simple-maps expects [lng, lat]
  ouagadougou: [-1.5197, 12.3714],
  ouaga: [-1.5197, 12.3714],
  "bobo-dioulasso": [-4.2979, 11.1771],
  bobo: [-4.2979, 11.1771],
  koudougou: [-2.3622, 12.253],
  banfora: [-4.7634, 10.6309],
  ouahigouya: [-2.4214, 13.5828],
  kaya: [-1.084, 13.0921],
  tenkodogo: [-0.3697, 11.7806],
  fada: [0.3583, 12.0617],
  "fada n'gourma": [0.3583, 12.0617],
  dedougou: [-3.4628, 12.4634],
  "dédougou": [-3.4628, 12.4634],
  dori: [-0.0356, 14.0353],
};
