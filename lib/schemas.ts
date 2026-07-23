import { Property } from "./data";
import { homeFaqItems } from "./home-content";
import { getPropertyPath, getPropertyTypeLabel } from "./property-url";
import { isDailyRental } from "./rental-period";
import { PRICE_PER_ROOM, formatFCFA } from "./visites-3d";

export const SITE_URL = "https://www.roogobf.com";
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

type JsonLdNode = Record<string, unknown>;

type BreadcrumbItem = {
  name: string;
  item: string;
};

function absoluteUrl(pathOrUrl: string) {
  return new URL(pathOrUrl, SITE_URL).toString();
}

function stripEmpty(value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => stripEmpty(item))
      .filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as JsonLdNode)
      .map(([key, item]) => [key, stripEmpty(item)] as const)
      .filter(([, item]) => item !== undefined);

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  return value;
}

function compact(node: JsonLdNode): JsonLdNode {
  return (stripEmpty(node) || {}) as JsonLdNode;
}

function graph(nodes: JsonLdNode[]) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.map(compact).filter((node) => Object.keys(node).length > 0),
  };
}

function propertyUrl(property: Property) {
  return `${SITE_URL}${getPropertyPath(property)}`;
}

function propertyName(property: Property) {
  return `${getPropertyTypeLabel(property.propertyType) || "Propriété"} à ${
    property.location || property.quartier || property.city || "Ouagadougou"
  }`;
}

function propertyDescription(property: Property) {
  return (
    property.description ||
    `${propertyName(property)} disponible sur Roogo.`
  );
}

function numericValue(value?: string | number | null) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getPropertyThingType(propertyType?: string) {
  const key = (propertyType || "").trim().toLowerCase();
  if (["appartement", "studio"].includes(key)) return "Apartment";
  if (["célibatorium", "celibatorium"].includes(key)) return "Accommodation";
  if (key === "villa") return "SingleFamilyResidence";
  if (key === "maison") return "House";
  if (key === "hotel") return "Hotel";
  return "Place";
}

function getAddress(property: Property) {
  return {
    "@type": "PostalAddress",
    streetAddress: property.address || property.location,
    addressLocality: property.city || "Ouagadougou",
    addressRegion: property.quartier,
    addressCountry: "BF",
  };
}

function getGeo(property: Property) {
  if (
    typeof property.latitude !== "number" ||
    typeof property.longitude !== "number"
  ) {
    return undefined;
  }

  return {
    "@type": "GeoCoordinates",
    latitude: property.latitude,
    longitude: property.longitude,
  };
}

function getAvailability(property: Property) {
  return property.status === "en_ligne"
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
}

function getUnitText(property: Property) {
  return isDailyRental(property) ? "nuit" : "mois";
}

function getImages(property: Property) {
  const images = property.images?.length ? property.images : [property.image];
  return images.filter(Boolean).map(absoluteUrl);
}

function getAmenityFeatures(property: Property) {
  return property.amenities?.map((amenity) => ({
    "@type": "LocationFeatureSpecification",
    name: amenity,
    value: true,
  }));
}

function getOrganizationNode(): JsonLdNode {
  return {
    "@type": "RealEstateAgent",
    "@id": ORGANIZATION_ID,
    name: "Roogo",
    legalName: "Roogo",
    description: "La référence de la location immobilière au Burkina Faso.",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png?v=2`,
    image: `${SITE_URL}/logo.png?v=2`,
    telephone: "+226-53-11-11-19",
    sameAs: [
      "https://facebook.com/roogobf",
      "https://instagram.com/roogo_bf",
      "https://linkedin.com/company/roogo",
    ],
    address: {
      "@type": "PostalAddress",
      addressLocality: "Ouagadougou",
      addressRegion: "Centre",
      addressCountry: "BF",
    },
    areaServed: [
      {
        "@type": "Country",
        name: "Burkina Faso",
      },
      {
        "@type": "City",
        name: "Ouagadougou",
      },
    ],
    brand: {
      "@type": "Brand",
      name: "Roogo",
      logo: `${SITE_URL}/logo.png?v=2`,
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+226-53-11-11-19",
      contactType: "customer service",
      availableLanguage: ["fr"],
      areaServed: "BF",
    },
  };
}

function getWebsiteNode(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: "Roogo",
    url: SITE_URL,
    inLanguage: "fr-BF",
    publisher: { "@id": ORGANIZATION_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/proprietes?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function getWebPageNode({
  id,
  type = "WebPage",
  url,
  name,
  description,
  mainEntity,
}: {
  id: string;
  type?: string;
  url: string;
  name: string;
  description: string;
  mainEntity?: JsonLdNode;
}): JsonLdNode {
  return {
    "@type": type,
    "@id": id,
    url,
    name,
    description,
    inLanguage: "fr-BF",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
    mainEntity,
  };
}

function getBreadcrumbNode(id: string, items: BreadcrumbItem[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

function getPropertyThingNode(property: Property): JsonLdNode {
  const area = numericValue(property.area);
  return {
    "@type": getPropertyThingType(property.propertyType),
    "@id": `${propertyUrl(property)}#property`,
    name: propertyName(property),
    description: propertyDescription(property),
    url: propertyUrl(property),
    image: getImages(property),
    address: getAddress(property),
    geo: getGeo(property),
    additionalType: getPropertyTypeLabel(property.propertyType),
    numberOfBedrooms: property.bedrooms || undefined,
    numberOfBathroomsTotal: property.bathrooms || undefined,
    numberOfRooms: property.bedrooms || undefined,
    floorSize: area
      ? {
          "@type": "QuantitativeValue",
          value: area,
          unitCode: "MTK",
        }
      : undefined,
    amenityFeature: getAmenityFeatures(property),
    occupancy: property.capaciteMax
      ? {
          "@type": "QuantitativeValue",
          value: property.capaciteMax,
        }
      : undefined,
    tourBookingPage: property.virtualTourUrl,
  };
}

function getPropertyOfferNode(property: Property): JsonLdNode {
  const price = numericValue(property.price);
  return {
    "@type": "Offer",
    "@id": `${propertyUrl(property)}#offer`,
    url: propertyUrl(property),
    price,
    priceCurrency: "XOF",
    availability: getAvailability(property),
    businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
    itemOffered: { "@id": `${propertyUrl(property)}#property` },
    seller: { "@id": ORGANIZATION_ID },
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price,
      priceCurrency: "XOF",
      unitText: getUnitText(property),
    },
  };
}

function getRealEstateListingNode(property: Property): JsonLdNode {
  return {
    "@type": "RealEstateListing",
    "@id": `${propertyUrl(property)}#listing`,
    name: propertyName(property),
    description: propertyDescription(property),
    url: propertyUrl(property),
    image: getImages(property),
    datePosted: property.created_at,
    inLanguage: "fr-BF",
    mainEntityOfPage: propertyUrl(property),
    about: { "@id": `${propertyUrl(property)}#property` },
    offers: { "@id": `${propertyUrl(property)}#offer` },
    provider: { "@id": ORGANIZATION_ID },
  };
}

function getVacationRentalNode(property: Property): JsonLdNode | undefined {
  const images = getImages(property);
  const geo = getGeo(property);

  if (
    !isDailyRental(property) ||
    !property.description ||
    !property.capaciteMax ||
    !geo ||
    images.length < 8
  ) {
    return undefined;
  }

  return {
    "@type": "VacationRental",
    "@id": `${propertyUrl(property)}#vacation-rental`,
    identifier: property.id,
    name: propertyName(property),
    description: propertyDescription(property),
    url: propertyUrl(property),
    image: images,
    address: getAddress(property),
    geo,
    latitude: property.latitude,
    longitude: property.longitude,
    brand: {
      "@type": "Brand",
      name: "Roogo",
    },
    containsPlace: {
      "@type": "Accommodation",
      occupancy: {
        "@type": "QuantitativeValue",
        value: property.capaciteMax,
      },
      numberOfBedrooms: property.bedrooms || undefined,
      numberOfBathroomsTotal: property.bathrooms || undefined,
      amenityFeature: getAmenityFeatures(property),
    },
  };
}

function getPropertyListNode(properties: Property[]): JsonLdNode {
  return {
    "@type": "ItemList",
    "@id": `${SITE_URL}/proprietes#itemlist`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: properties.length,
    itemListElement: properties.map((property, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: propertyUrl(property),
      item: {
        "@type": "RealEstateListing",
        "@id": `${propertyUrl(property)}#listing`,
        name: propertyName(property),
        url: propertyUrl(property),
        image: getImages(property)[0],
        offers: {
          "@type": "Offer",
          price: numericValue(property.price),
          priceCurrency: "XOF",
          availability: getAvailability(property),
        },
      },
    })),
  };
}

function getFaqPageNode(id: string, items: typeof homeFaqItems): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": id,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function getSiteIdentitySchema() {
  return graph([getOrganizationNode(), getWebsiteNode()]);
}

export function getHomePageSchema() {
  const url = SITE_URL;
  return graph([
    getWebPageNode({
      id: `${url}/#webpage`,
      url,
      name: "Location Appartement et Maison au Burkina Faso | Roogo",
      description:
        "Trouvez votre logement idéal à Ouagadougou et au Burkina Faso.",
      mainEntity: { "@id": ORGANIZATION_ID },
    }),
    getFaqPageNode(`${url}/#faq`, homeFaqItems),
  ]);
}

export function getAboutPageSchema() {
  const url = `${SITE_URL}/a-propos`;
  return graph([
    getWebPageNode({
      id: `${url}#webpage`,
      type: "AboutPage",
      url,
      name: "À propos de Roogo",
      description:
        "Découvrez Roogo, la plateforme qui simplifie la location immobilière au Burkina Faso.",
      mainEntity: { "@id": ORGANIZATION_ID },
    }),
    getBreadcrumbNode(`${url}#breadcrumb`, [
      { name: "Accueil", item: SITE_URL },
      { name: "À propos", item: url },
    ]),
  ]);
}

export function getVisites3dPageSchema() {
  const url = `${SITE_URL}/visites-3d`;
  return graph([
    getWebPageNode({
      id: `${url}#webpage`,
      url,
      name: "Visites virtuelles 3D à Ouagadougou | Roogo",
      description: `Scan 3D de biens immobiliers à Ouagadougou : visite virtuelle immersive, lien partageable, ${formatFCFA(PRICE_PER_ROOM)} par pièce.`,
      mainEntity: { "@id": `${url}#service` },
    }),
    getBreadcrumbNode(`${url}#breadcrumb`, [
      { name: "Accueil", item: SITE_URL },
      { name: "Visites 3D", item: url },
    ]),
    {
      "@type": "Service",
      "@id": `${url}#service`,
      name: "Visite virtuelle 3D immobilière",
      serviceType: "Visite virtuelle 3D immobilière",
      description:
        "Scan 3D sur place, visite virtuelle immersive hébergée et lien partageable pour vos biens immobiliers à Ouagadougou.",
      url,
      provider: { "@id": ORGANIZATION_ID },
      areaServed: [
        {
          "@type": "City",
          name: "Ouagadougou",
        },
        {
          "@type": "Country",
          name: "Burkina Faso",
        },
      ],
      offers: {
        "@type": "Offer",
        url,
        price: PRICE_PER_ROOM,
        priceCurrency: "XOF",
        availability: "https://schema.org/InStock",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: PRICE_PER_ROOM,
          priceCurrency: "XOF",
          unitText: "pièce",
        },
      },
    },
  ]);
}

export function getPropertiesCollectionSchema(properties: Property[]) {
  const url = `${SITE_URL}/proprietes`;
  return graph([
    getWebPageNode({
      id: `${url}#webpage`,
      type: "CollectionPage",
      url,
      name: "Location Appartement et Maison Ouagadougou | Roogo",
      description:
        "Parcourez les offres de location à Ouagadougou: appartements, maisons, villas, studios et locaux commerciaux.",
      mainEntity: { "@id": `${url}#itemlist` },
    }),
    getPropertyListNode(properties),
    getBreadcrumbNode(`${url}#breadcrumb`, [
      { name: "Accueil", item: SITE_URL },
      { name: "Propriétés", item: url },
    ]),
  ]);
}

export function getPropertyPageSchema(property: Property) {
  const url = propertyUrl(property);
  return graph([
    getWebPageNode({
      id: `${url}#webpage`,
      url,
      name: propertyName(property),
      description: propertyDescription(property),
      mainEntity: { "@id": `${url}#listing` },
    }),
    getBreadcrumbNode(`${url}#breadcrumb`, [
      { name: "Accueil", item: SITE_URL },
      { name: "Propriétés", item: `${SITE_URL}/proprietes` },
      { name: propertyName(property), item: url },
    ]),
    getRealEstateListingNode(property),
    getPropertyThingNode(property),
    getPropertyOfferNode(property),
    getVacationRentalNode(property) || {},
  ]);
}

export function getOrganizationSchema() {
  return graph([getOrganizationNode()]);
}

export function getWebSiteSchema() {
  return graph([getWebsiteNode()]);
}

export function getBreadcrumbSchema(items: BreadcrumbItem[]) {
  return graph([getBreadcrumbNode(`${SITE_URL}/#breadcrumb`, items)]);
}

export function getRealEstateListingSchema(property: Property) {
  return graph([
    getRealEstateListingNode(property),
    getPropertyThingNode(property),
    getPropertyOfferNode(property),
  ]);
}

export function getPropertyCanonicalUrl(property: Property) {
  return propertyUrl(property);
}

export function getPropertyDisplayName(property: Property) {
  return propertyName(property);
}

export function getPropertyDisplayDescription(property: Property) {
  return propertyDescription(property);
}
