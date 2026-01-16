import { Property } from "./data";

export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: "Roogo",
    description: "La référence de la location immobilière au Burkina Faso",
    url: "https://roogo.bf",
    logo: "https://roogo.bf/logo.png",
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
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+226-70-00-00-00",
      contactType: "customer service",
      availableLanguage: "French",
    },
  };
}

export function getWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Roogo",
    url: "https://roogo.bf",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://roogo.bf/location?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };
}

export function getBreadcrumbSchema(items: { name: string; item: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

export function getRealEstateListingSchema(property: Property) {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: property.title,
    description: property.description,
    url: `https://roogo.bf/location?id=${property.id}`,
    image: property.images || [property.image],
    address: {
      "@type": "PostalAddress",
      streetAddress: property.address,
      addressLocality: property.city || "Ouagadougou",
      addressCountry: "BF",
    },
    offers: {
      "@type": "Offer",
      price: property.price,
      priceCurrency: "XOF",
      availability: property.status === "en_ligne" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}
