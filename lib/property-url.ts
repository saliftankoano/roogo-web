import type { Property } from "./data";
import { isDailyRental } from "./rental-period";
import { CITY_OPTIONS } from "./validations";

// Slug + SEO helpers for property pages. The slug is stored on
// properties.slug (migration 056, regenerated once in 057), generated at
// creation and never regenerated so public URLs stay permanent. Keep
// buildPropertyBaseSlug in sync with the SQL backfill in 057.

// properties.city stores the picker id ("ouaga"), not a display name; both
// apps filter on the id, so translation to a label happens only at
// display/slug level, never in the DB.
export function getCityLabel(city?: string | null): string {
  const key = (city || "").trim().toLowerCase();
  return CITY_OPTIONS.find((c) => c.id === key)?.label || (city || "").trim();
}

// Free-text quartier hygiene at write time: collapse whitespace and tame
// ALL-CAPS entries ("TOEYIBIN" reads as shouting in URLs and descriptions).
export function normalizeQuartier(quartier?: string | null): string {
  const cleaned = (quartier || "").replace(/\s+/g, " ").trim();
  const letters = cleaned.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length > 3 && letters === letters.toUpperCase()) {
    return cleaned
      .toLowerCase()
      .replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
  }
  return cleaned;
}

export function getPropertyTypeLabel(type?: string) {
  const key = (type || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    appartement: "Appartement",
    studio: "Studio",
    "célibatorium": "Célibatorium",
    celibatorium: "Célibatorium",
    maison: "Maison",
    villa: "Villa",
    commercial: "Local commercial",
    terrain: "Terrain",
    hotel: "Hôtel",
  };
  return labels[key] || type || "";
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type SlugFields = {
  propertyType?: string | null;
  bedrooms?: number | null;
  listingType?: string | null;
  quartier?: string | null;
  city?: string | null;
};

const SLUG_MAX = 80;

export function buildPropertyBaseSlug(fields: SlugFields): string {
  const quartier = (fields.quartier || "").trim();
  const city = getCityLabel(fields.city);
  const parts = [
    getPropertyTypeLabel(fields.propertyType || undefined) || "Propriete",
    fields.bedrooms && fields.bedrooms > 0
      ? `${fields.bedrooms} chambres`
      : "",
    (fields.listingType || "louer").toLowerCase() === "vendre"
      ? "a vendre"
      : "a louer",
    quartier,
    city.toLowerCase() !== quartier.toLowerCase() ? city : "",
  ];
  const slug = slugify(parts.filter(Boolean).join(" ")) || "propriete";
  if (slug.length <= SLUG_MAX) return slug;
  // Sentence-length quartiers happen (free-text field): cut at a word
  // boundary so URLs stay sane.
  const cut = slug.slice(0, SLUG_MAX);
  const lastHyphen = cut.lastIndexOf("-");
  return lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
}

export function getPropertyPath(property: Property): string {
  return `/proprietes/${property.slug || property.id}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(segment: string): boolean {
  return UUID_RE.test(segment);
}

const META_DESCRIPTION_MAX = 160;

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max - 1).replace(/[,.;:]$/, "")}…`;
}

function getPropertyPlace(property: Property): string {
  const quartier = (property.quartier || "").trim();
  const city = getCityLabel(property.city);
  return quartier && city && quartier.toLowerCase() !== city.toLowerCase()
    ? `${quartier}, ${city}`
    : quartier || city || property.location;
}

function roomsLabel(count: number, singular: string, plural: string) {
  return `${count} ${count > 1 ? plural : singular}`;
}

// "Villa 2 chambres à vendre à Balkuy, Ouagadougou". What people type into
// Google, so it leads the page title, the H1 and the meta description.
export function getPropertyHeadline(property: Property): string {
  const typeLabel = getPropertyTypeLabel(property.propertyType) || "Propriété";
  const action = property.listingType === "vendre" ? "à vendre" : "à louer";
  const place = getPropertyPlace(property);
  return [
    typeLabel,
    property.bedrooms > 0
      ? roomsLabel(property.bedrooms, "chambre", "chambres")
      : "",
    action,
    place ? `à ${place}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// "8 500 000 FCFA", "150 000 FCFA par mois" or "17 500 FCFA par nuit";
// empty when the price is missing.
export function getPropertyPriceLabel(property: Property): string {
  const priceValue = Number(property.price);
  if (!Number.isFinite(priceValue) || priceValue <= 0) return "";
  const amount = `${priceValue.toLocaleString("fr-FR")} FCFA`;
  if (property.listingType === "vendre") return amount;
  return isDailyRental(property) ? `${amount} par nuit` : `${amount} par mois`;
}

const SEO_TITLE_MAX = 70;

// <title> before the "| Roogo" suffix: headline plus price when it fits.
export function getPropertySeoTitle(property: Property): string {
  const headline = getPropertyHeadline(property);
  const price = getPropertyPriceLabel(property);
  const withPrice = price ? `${headline} : ${price}` : headline;
  return withPrice.length <= SEO_TITLE_MAX ? withPrice : headline;
}

export function getPropertyMetaDescription(property: Property): string {
  const price = getPropertyPriceLabel(property);
  const ownerDescription = (property.description || "")
    .replace(/\s+/g, " ")
    .trim();

  const sentence = [
    `${getPropertyHeadline(property)}.`,
    price ? `${price}.` : "",
    ownerDescription,
  ]
    .filter(Boolean)
    .join(" ");

  return truncateAtWord(sentence, META_DESCRIPTION_MAX);
}

const AMENITY_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  securite: "sécurité",
  jardin: "jardin",
  solaires: "panneaux solaires",
  piscine: "piscine",
  meuble: "meublé",
};

// Demonstrative per property type: "Cette villa", "Cet appartement".
const TYPE_SUBJECTS: Record<string, string> = {
  appartement: "Cet appartement",
  studio: "Ce studio",
  "célibatorium": "Ce célibatorium",
  celibatorium: "Ce célibatorium",
  maison: "Cette maison",
  villa: "Cette villa",
  commercial: "Ce local commercial",
  terrain: "Ce terrain",
  hotel: "Cet hôtel",
};

// A factual paragraph built only from the listing's own fields, shown on the
// page under "En résumé". Owners often write one line ("Très belle
// opportunité"); this keeps every listing page specific enough for Google
// and readers without inventing anything.
export function getPropertySummary(property: Property): string {
  const typeKey = (property.propertyType || "").trim().toLowerCase();
  const subject = TYPE_SUBJECTS[typeKey] || "Ce bien";
  const isSale = property.listingType === "vendre";
  const area = Number(property.area);

  const features = [
    property.bedrooms > 0
      ? roomsLabel(property.bedrooms, "chambre", "chambres")
      : "",
    property.bathrooms > 0
      ? roomsLabel(property.bathrooms, "salle de bain", "salles de bain")
      : "",
    Number.isFinite(area) && area > 0 ? `${area.toLocaleString("fr-FR")} m²` : "",
  ].filter(Boolean);

  const place = getPropertyPlace(property);
  const price = getPropertyPriceLabel(property);
  const sentences: string[] = [];

  sentences.push(
    [
      subject,
      features.length ? `(${features.join(", ")})` : "",
      isSale ? "est à vendre" : "est à louer",
      place ? `à ${place}${price ? "," : ""}` : "",
      price ? (isSale ? `au prix de ${price}` : `pour ${price}`) : "",
    ]
      .filter(Boolean)
      .join(" ") + ".",
  );

  if (property.parking > 0) {
    sentences.push(
      `Stationnement : ${roomsLabel(property.parking, "place", "places")}.`,
    );
  }

  const amenities = (property.amenities || [])
    .map((id) => AMENITY_LABELS[id] || id)
    .filter(Boolean);
  if (amenities.length) {
    sentences.push(`Équipements : ${amenities.join(", ")}.`);
  }

  if (property.reference) {
    sentences.push(`Référence de l'annonce : ${property.reference}.`);
  }

  sentences.push(
    isSale
      ? "Roogo vérifie les documents de propriété avant la mise en ligne et accompagne l'acheteur jusqu'à la signature chez le notaire."
      : "Contactez Roogo pour organiser la visite.",
  );

  return sentences.join(" ");
}
