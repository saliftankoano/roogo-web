import type { Property } from "./data";
import { isDailyRental } from "./rental-period";

// Slug + SEO helpers for property pages. The slug is stored on
// properties.slug (migration 056), generated once at creation and never
// regenerated so public URLs stay permanent. Keep buildPropertyBaseSlug in
// sync with the SQL backfill in 056_property_slugs.sql.

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

export function buildPropertyBaseSlug(fields: SlugFields): string {
  const quartier = (fields.quartier || "").trim();
  const city = (fields.city || "").trim();
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
  return slugify(parts.filter(Boolean).join(" ")) || "propriete";
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
  const city = (property.city || "").trim();
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
