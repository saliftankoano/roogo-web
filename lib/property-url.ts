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

export function getPropertyMetaDescription(property: Property): string {
  const typeLabel = getPropertyTypeLabel(property.propertyType) || "Propriété";
  const action = property.listingType === "vendre" ? "à vendre" : "à louer";
  const quartier = (property.quartier || "").trim();
  const city = getCityLabel(property.city);
  const place =
    quartier && city && quartier.toLowerCase() !== city.toLowerCase()
      ? `${quartier}, ${city}`
      : quartier || city || property.location;

  const lead = [
    typeLabel,
    property.bedrooms > 0 ? `${property.bedrooms} chambres` : "",
    action,
    place ? `à ${place}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const priceValue = Number(property.price);
  let priceSentence = "";
  if (Number.isFinite(priceValue) && priceValue > 0) {
    const amount = `${priceValue.toLocaleString("fr-FR")} FCFA`;
    if (property.listingType === "vendre") {
      priceSentence = `${amount}.`;
    } else if (isDailyRental(property)) {
      priceSentence = `${amount} par nuit.`;
    } else {
      priceSentence = `${amount} par mois.`;
    }
  }

  const ownerDescription = (property.description || "")
    .replace(/\s+/g, " ")
    .trim();

  const sentence = [`${lead}.`, priceSentence, ownerDescription]
    .filter(Boolean)
    .join(" ");

  return truncateAtWord(sentence, META_DESCRIPTION_MAX);
}
