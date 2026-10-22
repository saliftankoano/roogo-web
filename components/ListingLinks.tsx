import Link from "next/link";
import type { Property } from "@/lib/data";
import {
  getCityLabel,
  getPropertyPath,
  getPropertyTypeLabel,
} from "@/lib/property-url";
import { isDailyRental } from "@/lib/rental-period";

// Server-rendered plain links to listing pages. The listing grid is a client
// component that only shows one of Louer / Acheter at a time, so without
// these links Google never finds sale listings except through the sitemap
// (they sat in "Discovered - currently not indexed").

export function getListingLinkLabel(property: Property): string {
  const type = getPropertyTypeLabel(property.propertyType) || "Propriété";
  const rooms = property.bedrooms > 0 ? ` ${property.bedrooms} ch.` : "";
  const action = property.listingType === "vendre" ? "à vendre" : "à louer";
  const quartier = (property.quartier || "").trim();
  const city = getCityLabel(property.city);
  const place =
    quartier && city && quartier.toLowerCase() !== city.toLowerCase()
      ? `${quartier}, ${city}`
      : quartier || city || property.location;
  return `${type}${rooms} ${action}${place ? `, ${place}` : ""}`;
}

function getListingPriceLabel(property: Property): string {
  const value = Number(property.price);
  if (!Number.isFinite(value) || value <= 0) return "";
  const amount = `${value.toLocaleString("fr-FR")} FCFA`;
  if (property.listingType === "vendre") return amount;
  return isDailyRental(property) ? `${amount} / nuit` : `${amount} / mois`;
}

export function ListingLinkList({ properties }: { properties: Property[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {properties.map((property) => {
        const price = getListingPriceLabel(property);
        return (
          <li key={property.id} className="min-w-0">
            <Link
              href={getPropertyPath(property)}
              className="block truncate text-sm font-medium text-neutral-700 hover:text-primary hover:underline"
            >
              {getListingLinkLabel(property)}
              {price && (
                <span className="text-neutral-400"> · {price}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AllListingsDirectory({
  properties,
}: {
  properties: Property[];
}) {
  const forSale = properties.filter((p) => p.listingType === "vendre");
  const forRent = properties.filter((p) => p.listingType !== "vendre");
  if (properties.length === 0) return null;

  return (
    <section
      aria-labelledby="toutes-les-annonces"
      className="mx-auto max-w-7xl px-6 pb-20"
    >
      <div className="rounded-[2rem] border border-black/5 bg-white p-6 md:p-8">
        <h2
          id="toutes-les-annonces"
          className="mb-6 text-xl font-black text-neutral-900"
        >
          Toutes nos annonces
        </h2>
        <div className="space-y-8">
          {forSale.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-500">
                À vendre ({forSale.length})
              </h3>
              <ListingLinkList properties={forSale} />
            </div>
          )}
          {forRent.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-500">
                À louer ({forRent.length})
              </h3>
              <ListingLinkList properties={forRent} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Other live listings of the same kind (sale vs rent), same city first.
export function pickRelatedListings(
  current: Property,
  all: Property[],
  limit = 6,
): Property[] {
  const sameKind = all.filter(
    (p) =>
      p.id !== current.id &&
      (p.listingType ?? "louer") === (current.listingType ?? "louer"),
  );
  const sameCity = sameKind.filter((p) => p.city && p.city === current.city);
  const others = sameKind.filter((p) => !sameCity.includes(p));
  return [...sameCity, ...others].slice(0, limit);
}

export function RelatedListings({
  current,
  related,
}: {
  current: Property;
  related: Property[];
}) {
  if (related.length === 0) return null;
  const heading =
    current.listingType === "vendre"
      ? "Autres biens à vendre"
      : "Autres biens à louer";
  const allHref =
    current.listingType === "vendre"
      ? "/proprietes?transaction=vendre"
      : "/proprietes";

  return (
    <section
      aria-labelledby="autres-biens"
      className="mx-auto max-w-7xl px-6 pb-20"
    >
      <div className="rounded-[2rem] border border-black/5 bg-white p-6 md:p-8">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id="autres-biens" className="text-xl font-black text-neutral-900">
            {heading}
          </h2>
          <Link
            href={allHref}
            className="shrink-0 text-sm font-bold text-primary hover:underline"
          >
            Voir tout
          </Link>
        </div>
        <ListingLinkList properties={related} />
      </div>
    </section>
  );
}
