import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { PropertyDetailClient } from "@/components/PropertyDetailClient";
import { fetchPropertyById } from "@/lib/data";
import {
  getPropertyCanonicalUrl,
  getPropertyDisplayDescription,
  getPropertyDisplayName,
  getPropertyPageSchema,
} from "@/lib/schemas";

type PropertyPageProps = {
  params: Promise<{ id: string }> | { id: string };
};

export const dynamic = "force-dynamic";

function metadataDescription(description: string) {
  return description.replace(/\s+/g, " ").trim().slice(0, 160);
}

async function getPageProperty(params: PropertyPageProps["params"]) {
  const { id } = await params;
  const property = await fetchPropertyById(id);
  if (!property || property.is_test) {
    return null;
  }
  return property;
}

export async function generateMetadata({
  params,
}: PropertyPageProps): Promise<Metadata> {
  const property = await getPageProperty(params);

  if (!property) {
    return {
      title: "Propriété introuvable",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = `${getPropertyDisplayName(property)} | Roogo`;
  const description = metadataDescription(
    getPropertyDisplayDescription(property),
  );
  const canonical = getPropertyCanonicalUrl(property);
  const image = property.image || property.images?.[0] || "/hero-bg.jpg";
  const indexable = property.status === "en_ligne";

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    robots: {
      index: indexable,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [
        {
          url: image,
          alt: getPropertyDisplayName(property),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PropertyPage({ params }: PropertyPageProps) {
  const property = await getPageProperty(params);

  if (!property) {
    notFound();
  }

  return (
    <>
      <JsonLd schema={getPropertyPageSchema(property)} />
      <PropertyDetailClient initialListing={property} propertyId={property.id} />
    </>
  );
}
