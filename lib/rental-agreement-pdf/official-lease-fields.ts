// Maps a monthly rental agreement onto the blanks of the official Burkina Faso
// lease template (docs/contrat-de-bail-modele.pdf). Every field is either a
// filled string or null; null means "print a dotted line to complete by hand".
// Kept free of runtime imports so node --test can exercise it directly.

import type { AgreementPdfData } from "./types";

export type LeaseBlank = string | null;

export interface LeasePartyFields {
  nom: LeaseBlank;
  prenom: LeaseBlank;
  pieceNumero: LeaseBlank;
  pieceDate: LeaseBlank;
  pieceLieu: LeaseBlank;
  /** Preneur only: "ou dénomination de la société". */
  denomination: LeaseBlank;
  bp: LeaseBlank;
  lot: LeaseBlank;
  parcelles: LeaseBlank;
  section: LeaseBlank;
  secteur: LeaseBlank;
  rue: LeaseBlank;
  porte: LeaseBlank;
  profession: LeaseBlank;
  designation: LeaseBlank;
}

export interface OfficialLeaseFields {
  reference: string;
  bailleur: LeasePartyFields;
  preneur: LeasePartyFields;
  bien: {
    usage: LeaseBlank;
    siseA: LeaseBlank;
    commune: LeaseBlank;
    secteur: LeaseBlank;
    quartier: LeaseBlank;
    lot: LeaseBlank;
    parcelles: LeaseBlank;
    section: LeaseBlank;
    secteurParcellaire: LeaseBlank;
    titreNumero: LeaseBlank;
    titreDate: LeaseBlank;
    rue: LeaseBlank;
    porte: LeaseBlank;
    superficie: LeaseBlank;
    /** true = OUI, false = NON, null = leave both boxes empty. */
    eauCourante: boolean | null;
    electricite: boolean | null;
    autresEquipements: LeaseBlank;
  };
  duree: { duree: LeaseBlank; debut: LeaseBlank; fin: LeaseBlank };
  loyer: { mensuel: LeaseBlank; depot: LeaseBlank; representant: LeaseBlank };
  conditionsParticulieres: string[];
  domicile: { bailleurTelephone: LeaseBlank; preneurTelephone: LeaseBlank };
  faitA: LeaseBlank;
  faitLe: LeaseBlank;
  signatures: {
    bailleur: { nom: LeaseBlank; signeLe: LeaseBlank };
    preneur: { nom: LeaseBlank; signeLe: LeaseBlank };
  };
}

// Residential property types (lib/constants.ts PROPERTY_TYPE_IDS).
const HABITATION_TYPES = new Set([
  "villa",
  "appartement",
  "maison",
  "célibatorium",
  "celibatorium",
]);

const WATER_AMENITY = /(eau courante|\beau\b|onea|forage)/i;
const ELECTRICITY_AMENITY = /(électricit|electricit|sonabel)/i;

export const RENT_COLLECTION_TERMS =
  "Les loyers suivants sont encaissés par Roogo par défaut. Roogo retient 7% sur chaque loyer effectivement encaissé via la plateforme. Le propriétaire peut désactiver cette collecte pour les échéances futures non payées depuis le bail dans l'application; le premier loyer reste toutefois payable via Roogo lorsqu'un frais de succès de publication est encore dû.";

function clean(value: string | null | undefined): LeaseBlank {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed === "—" || trimmed === "undefined") return null;
  return trimmed;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** "75000" -> "75 000" with a plain space (Helvetica has no U+202F). */
export function formatAmount(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 420 -> "420", 1250.5 -> "1 250,5" (French decimal comma). */
function formatSurface(area: number): string {
  const rounded = Math.round(area * 100) / 100;
  const whole = Math.trunc(rounded);
  const decimals = Math.round((rounded - whole) * 100);
  if (decimals === 0) return formatAmount(whole);
  return `${formatAmount(whole)},${String(decimals).padStart(2, "0").replace(/0$/, "")}`;
}

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
];
const TENS = [
  "",
  "dix",
  "vingt",
  "trente",
  "quarante",
  "cinquante",
  "soixante",
  "soixante",
  "quatre-vingt",
  "quatre-vingt",
];

function below100(n: number): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const ten = Math.floor(n / 10);
  let unit = n % 10;
  if (ten === 7 || ten === 9) unit += 10;
  if (unit === 0) return ten === 8 ? "quatre-vingts" : TENS[ten];
  if (unit === 1 && ten !== 8 && ten !== 9) {
    return `${TENS[ten]} et un`;
  }
  if (unit === 11 && ten === 7) return `${TENS[ten]} et onze`;
  return `${TENS[ten]}-${below100(unit)}`;
}

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return below100(rest);
  const head =
    hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent${rest === 0 ? "s" : ""}`;
  return rest === 0 ? head : `${head} ${below100(rest)}`;
}

/** French words for a whole amount, traditional spelling ("soixante-quinze mille"). */
export function amountInFrenchWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const scales: Array<[number, string, string]> = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ];
  for (const [value, singular, plural] of scales) {
    const count = Math.floor(n / value);
    if (count > 0) {
      parts.push(`${below1000(count)} ${count > 1 ? plural : singular}`);
      n %= value;
    }
  }
  const thousands = Math.floor(n / 1000);
  if (thousands > 0) {
    // "mille" never takes an s, and "cent"/"quatre-vingts" lose theirs before it.
    const words =
      thousands === 1
        ? "mille"
        : `${below1000(thousands).replace(/(cent|vingt)s$/, "$1")} mille`;
    parts.push(words);
    n %= 1000;
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(" ");
}

function amountWithWords(amount: number): string {
  return `${amountInFrenchWords(amount)} (${formatAmount(amount)})`;
}

/** Calendar date in Burkina Faso time (UTC+0, no DST), DD/MM/YYYY. */
export function formatLeaseDate(value: string | null | undefined): LeaseBlank {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", { timeZone: "Africa/Ouagadougou" });
}

function utcParts(value: string) {
  const d = new Date(value);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    time: d.getTime(),
  };
}

/**
 * Whole-month length between start and end, accepting both conventions
 * (01/11 -> 01/11 and 01/11 -> 31/10). Returns null when it is not a whole
 * number of months, so the duration is left to complete by hand.
 */
export function leaseMonths(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const s = utcParts(start);
  const e = utcParts(end);
  if (Number.isNaN(s.time) || Number.isNaN(e.time) || e.time <= s.time) {
    return null;
  }
  const dayAfterEnd = utcParts(new Date(e.time + 86_400_000).toISOString());
  for (const candidate of [e, dayAfterEnd]) {
    if (candidate.day === s.day) {
      const months = (candidate.y - s.y) * 12 + (candidate.m - s.m);
      if (months > 0) return months;
    }
  }
  return null;
}

function durationLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${amountInFrenchWords(years)} (${years}) an${years > 1 ? "s" : ""}`;
  }
  return `${amountInFrenchWords(months)} (${months}) mois`;
}

/**
 * full_name is built as "<first> <last>" from Clerk (lib/user-sync.ts), so
 * the last word is the Nom and the rest the Prénom. A single word fills Nom.
 */
export function splitFullName(fullName: string | null | undefined): {
  nom: LeaseBlank;
  prenom: LeaseBlank;
} {
  const name = clean(fullName);
  if (!name) return { nom: null, prenom: null };
  const words = name.split(" ");
  if (words.length < 2) return { nom: name, prenom: null };
  return {
    nom: words[words.length - 1],
    prenom: words.slice(0, -1).join(" "),
  };
}

function emptyParty(designation: string): LeasePartyFields {
  return {
    nom: null,
    prenom: null,
    pieceNumero: null,
    pieceDate: null,
    pieceLieu: null,
    denomination: null,
    bp: null,
    lot: null,
    parcelles: null,
    section: null,
    secteur: null,
    rue: null,
    porte: null,
    profession: null,
    designation,
  };
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function buildOfficialLeaseFields(
  data: AgreementPdfData,
): OfficialLeaseFields {
  const property = data.property ?? null;
  const ownerName = splitFullName(data.owner?.full_name);
  const renterName = splitFullName(data.renter?.full_name);

  const amenities = (property?.amenities ?? [])
    .map((name) => clean(name))
    .filter((name): name is string => !!name);
  const waterAmenity = amenities.find((name) => WATER_AMENITY.test(name));
  const electricityAmenity = amenities.find((name) =>
    ELECTRICITY_AMENITY.test(name),
  );
  const otherEquipment: string[] = [];
  if (isFiniteNumber(property?.bedrooms) && property.bedrooms > 0) {
    otherEquipment.push(plural(property.bedrooms, "chambre", "chambres"));
  }
  if (isFiniteNumber(property?.bathrooms) && property.bathrooms > 0) {
    otherEquipment.push(
      plural(property.bathrooms, "salle de bain", "salles de bain"),
    );
  }
  for (const name of amenities) {
    if (name !== waterAmenity && name !== electricityAmenity) {
      otherEquipment.push(name);
    }
  }

  const propertyType = clean(property?.property_type)?.toLowerCase() ?? null;
  const usage = propertyType
    ? HABITATION_TYPES.has(propertyType)
      ? "habitation"
      : propertyType === "commercial"
        ? "commercial"
        : null
    : null;

  const city = clean(property?.city);
  const area = property?.area;

  const rent = isFiniteNumber(data.monthly_rent) ? data.monthly_rent : null;
  const cautionMonths = isFiniteNumber(data.caution_mois)
    ? data.caution_mois
    : null;
  const deposit =
    rent !== null && cautionMonths !== null ? rent * cautionMonths : null;
  let representant: LeaseBlank = null;
  if (deposit === 0) {
    representant = "aucun dépôt de garantie";
  } else if (deposit !== null && rent && deposit % rent === 0) {
    const months = deposit / rent;
    representant = `${amountInFrenchWords(months)} (${months}) mois de loyer`;
  }

  const months = leaseMonths(data.start_date, data.end_date);

  const conditions: string[] = [];
  const advanceMonths = isFiniteNumber(data.loyer_avance_mois)
    ? data.loyer_avance_mois
    : 1;
  if (rent !== null && advanceMonths > 0) {
    const advance = `Loyer d'avance : ${plural(advanceMonths, "mois", "mois")}, soit ${formatAmount(rent * advanceMonths)} FCFA, payable à la signature`;
    conditions.push(
      deposit !== null
        ? `${advance} avec le dépôt, pour un total de ${formatAmount(rent * advanceMonths + deposit)} FCFA.`
        : `${advance}.`,
    );
  }
  for (const line of [...data.interdictions, ...data.dos_and_donts]) {
    const text = clean(line);
    if (text) conditions.push(/[.!?]$/.test(text) ? text : `${text}.`);
  }
  const terms = clean(data.terms_text);
  if (terms) conditions.push(terms);
  conditions.push(RENT_COLLECTION_TERMS);

  const ownerSigned = formatLeaseDate(data.owner_signed_at);
  const renterSigned = formatLeaseDate(data.renter_signed_at);
  let faitLe: LeaseBlank = null;
  if (data.owner_signed_at && data.renter_signed_at) {
    const latest =
      new Date(data.owner_signed_at).getTime() >
      new Date(data.renter_signed_at).getTime()
        ? data.owner_signed_at
        : data.renter_signed_at;
    faitLe = formatLeaseDate(latest);
  }

  return {
    reference: data.id.substring(0, 8).toUpperCase(),
    bailleur: { ...emptyParty("le Bailleur"), ...ownerName },
    preneur: { ...emptyParty("le Preneur"), ...renterName },
    bien: {
      usage,
      siseA: city,
      commune: city,
      secteur: null,
      quartier: clean(property?.quartier),
      lot: null,
      parcelles: null,
      section: null,
      secteurParcellaire: null,
      titreNumero: null,
      titreDate: null,
      rue: null,
      porte: null,
      superficie: isFiniteNumber(area) && area > 0 ? formatSurface(area) : null,
      eauCourante: waterAmenity ? true : null,
      electricite: electricityAmenity ? true : null,
      autresEquipements: otherEquipment.length
        ? otherEquipment.join(", ")
        : null,
    },
    duree: {
      duree: months ? durationLabel(months) : null,
      debut: formatLeaseDate(data.start_date),
      fin: formatLeaseDate(data.end_date),
    },
    loyer: {
      mensuel: rent !== null ? amountWithWords(rent) : null,
      depot: deposit !== null ? amountWithWords(deposit) : null,
      representant,
    },
    conditionsParticulieres: conditions,
    domicile: {
      bailleurTelephone: clean(data.owner?.phone),
      preneurTelephone: clean(data.renter?.phone),
    },
    faitA: city,
    faitLe,
    signatures: {
      bailleur: {
        nom: clean(data.owner?.full_name),
        signeLe: ownerSigned && data.owner_signed_at ? ownerSigned : null,
      },
      preneur: {
        nom: clean(data.renter?.full_name),
        signeLe: renterSigned && data.renter_signed_at ? renterSigned : null,
      },
    },
  };
}
