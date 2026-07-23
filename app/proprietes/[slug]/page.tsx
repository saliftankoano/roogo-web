import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { PropertyDetailClient } from "@/components/PropertyDetailClient";
import {
  fetchPropertyById,
  fetchPropertyBySlug,
  type Property,
} from "@/lib/data";
import { getPropertyMetaDescription, isUuid } from "@/lib/property-url";
import {
  getPropertyCanonicalUrl,
  getPropertyDisplayName,
  getPropertyPageSchema,
} from "@/lib/schemas";

type PropertyPageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

export const dynamic = "force-dynamic";

type ResolvedProperty = {
  property: Property | null;
  // Set when the request used a legacy /proprietes/<uuid> URL and the row has
  // a slug: the page must 308 to the canonical slug URL.
  redirectToSlug: string | null;
};

async function resolveProperty(
  params: PropertyPageProps["params"],
): Promise<ResolvedProperty> {
  const { slug } = await params;
  const segment = decodeURIComponent(slug);

  const property = isUuid(segment)
    ? await fetchPropertyById(segment.toLowerCase())
    : await fetchPropertyBySlug(segment);

  if (!property || property.is_test) {
    return { property: null, redirectToSlug: null };
  }

  const redirectToSlug =
    isUuid(segment) && property.slug ? property.slug : null;

  return { property, redirectToSlug };
}

export async function generateMetadata({
  params,
}: PropertyPageProps): Promise<Metadata> {
  const { property } = await resolveProperty(params);

  if (!property) {
    return {
      title: "Propriété introuvable",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = getPropertyDisplayName(property);
  const description = getPropertyMetaDescription(property);
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
          alt: title,
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
  const { property, redirectToSlug } = await resolveProperty(params);

  if (!property) {
    notFound();
  }

  if (redirectToSlug) {
    permanentRedirect(`/proprietes/${redirectToSlug}`);
  }

  return (
    <>
      <JsonLd schema={getPropertyPageSchema(property)} />
      <PropertyDetailClient initialListing={property} propertyId={property.id} />
    </>
  );
}
