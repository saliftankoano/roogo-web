import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { notFound, permanentRedirect } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import AdminListingDetail from "@/components/admin/AdminListingDetail";
import { PropertyDetailClient } from "@/components/PropertyDetailClient";
import {
  fetchPropertyById,
  fetchPropertyBySlug,
  type Property,
} from "@/lib/data";
import { getPropertyMetaDescription, isUuid } from "@/lib/property-url";
import { isStaffLikeMetadata } from "@/lib/user-types";
import {
  getPropertyCanonicalUrl,
  getPropertyDisplayName,
  getPropertyPageSchema,
} from "@/lib/schemas";

type PropertyPageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

export const dynamic = "force-dynamic";

// One canonical URL per listing for EVERY viewer: staff/founders get the
// admin management view rendered at the same public slug URL, so the link
// in their address bar is always the shareable public one. The render gate
// here is UX; the real security boundary is the staff checks in the API
// mutation routes.
async function isStaffViewer(): Promise<boolean> {
  const user = await currentUser().catch(() => null);
  return isStaffLikeMetadata(user?.publicMetadata);
}

type ResolvedProperty = {
  property: Property | null;
  // Set when the request used a legacy /proprietes/<uuid> URL and the row has
  // a slug: the page must 308 to the canonical slug URL.
  redirectToSlug: string | null;
};

async function resolveProperty(
  params: PropertyPageProps["params"],
  viewerIsStaff: boolean,
): Promise<ResolvedProperty> {
  const { slug } = await params;
  const segment = decodeURIComponent(slug);

  const property = isUuid(segment)
    ? await fetchPropertyById(segment.toLowerCase())
    : await fetchPropertyBySlug(segment);

  // Staff can open test listings at their public URL; everyone else 404s.
  if (!property || (property.is_test && !viewerIsStaff)) {
    return { property: null, redirectToSlug: null };
  }

  const redirectToSlug =
    isUuid(segment) && property.slug ? property.slug : null;

  return { property, redirectToSlug };
}

export async function generateMetadata({
  params,
}: PropertyPageProps): Promise<Metadata> {
  const viewerIsStaff = await isStaffViewer();
  const { property } = await resolveProperty(params, viewerIsStaff);

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
  const indexable = property.status === "en_ligne" && !property.is_test;

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
  const viewerIsStaff = await isStaffViewer();
  const { property, redirectToSlug } = await resolveProperty(
    params,
    viewerIsStaff,
  );

  if (!property) {
    notFound();
  }

  if (redirectToSlug) {
    permanentRedirect(`/proprietes/${redirectToSlug}`);
  }

  if (viewerIsStaff) {
    return <AdminListingDetail propertyId={property.id} />;
  }

  return (
    <>
      <JsonLd schema={getPropertyPageSchema(property)} />
      <PropertyDetailClient initialListing={property} propertyId={property.id} />
    </>
  );
}
