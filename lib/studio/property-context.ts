// Turns a listing row into the facts the Studio chat may use when writing a
// voice-over. Pure: the label helpers are passed in so this file can be
// tested without the app's import aliases.
//
// WHITELIST ON PURPOSE. Only the fields below are read. Never add the
// seller's net price (seller_asking_price), the owner's name or phone, or any
// agent field: they must not reach the model or a public voice-over.

export type PropertyRow = {
  id: string;
  property_type: string | null;
  listing_type: string | null; // "louer" | "vendre"
  frequence: string | null; // "mensuel" | "journalier" | null
  quartier: string | null;
  city: string | null;
  price: number | string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | string | null;
  amenities: string[] | null;
  dos_and_donts: string[] | null;
  interdictions: string[] | null;
  description: string | null;
  status: string | null;
  sejour_minimum: number | null;
  capacite_max: number | null;
  caution_mois: number | null;
  loyer_avance_mois: number | null;
  images?: string[] | null;
};

export type PropertyLabels = {
  city: (city?: string | null) => string;
  type: (type?: string) => string;
  amount: (amount?: string | number | null) => string;
};

export type PropertySummary = {
  id: string;
  title: string;
  offer: string;
  place: string;
  price: string;
  image: string | null;
  live: boolean;
};

function offerLabel(row: PropertyRow): string {
  if (row.listing_type === "vendre") return "À vendre";
  return row.frequence === "journalier"
    ? "À louer à la nuit"
    : "À louer au mois";
}

function placeLabel(row: PropertyRow, labels: PropertyLabels): string {
  const quartier = (row.quartier ?? "").trim();
  const city = labels.city(row.city);
  return [quartier, city].filter(Boolean).join(", ");
}

function priceLabel(row: PropertyRow, labels: PropertyLabels): string {
  if (row.price === null || row.price === undefined || row.price === "") return "";
  const amount = `${labels.amount(row.price)} FCFA`;
  if (row.listing_type === "vendre") return amount;
  return row.frequence === "journalier"
    ? `${amount} par nuit`
    : `${amount} par mois`;
}

export function propertyTitle(row: PropertyRow, labels: PropertyLabels): string {
  const type = labels.type(row.property_type ?? undefined);
  const offer = row.listing_type === "vendre" ? "à vendre" : "à louer";
  const place = (row.quartier ?? "").trim();
  return [`${type} ${offer}`, place].filter(Boolean).join(", ");
}

export function toPropertySummary(
  row: PropertyRow,
  labels: PropertyLabels,
): PropertySummary {
  return {
    id: row.id,
    title: propertyTitle(row, labels),
    offer: offerLabel(row),
    place: placeLabel(row, labels),
    price: priceLabel(row, labels),
    image: row.images?.[0] ?? null,
    live: row.status === "en_ligne",
  };
}

function listLine(label: string, items: string[] | null | undefined): string | null {
  const cleaned = (items ?? []).map((item) => item.trim()).filter(Boolean);
  return cleaned.length ? `${label} : ${cleaned.join(", ")}` : null;
}

export function buildPropertyFacts(
  row: PropertyRow,
  labels: PropertyLabels,
): string {
  const lines: Array<string | null> = [
    `Type de bien : ${labels.type(row.property_type ?? undefined)}`,
    `Offre : ${offerLabel(row)}`,
    placeLabel(row, labels) ? `Lieu : ${placeLabel(row, labels)}` : null,
    priceLabel(row, labels) ? `Prix : ${priceLabel(row, labels)}` : null,
    row.bedrooms ? `Chambres : ${row.bedrooms}` : null,
    row.bathrooms ? `Salles de bain : ${row.bathrooms}` : null,
    row.area ? `Superficie : ${row.area} m²` : null,
    listLine("Équipements", row.amenities),
    listLine("Règles de la maison", row.dos_and_donts),
    listLine("Interdictions", row.interdictions),
    row.caution_mois ? `Caution : ${row.caution_mois} mois` : null,
    row.loyer_avance_mois
      ? `Loyer d'avance : ${row.loyer_avance_mois} mois`
      : null,
    row.sejour_minimum ? `Séjour minimum : ${row.sejour_minimum} nuits` : null,
    row.capacite_max ? `Capacité : ${row.capacite_max} personnes` : null,
    row.description?.trim() ? `Description : ${row.description.trim()}` : null,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
