import { notFound, permanentRedirect } from "next/navigation";
import { fetchPropertyById } from "@/lib/data";
import { getPropertyPath } from "@/lib/property-url";

// The listing detail view now lives at the PUBLIC slug URL for everyone
// (staff get the admin capabilities there, see app/proprietes/[slug]).
// This route only remains so existing admin-panel links and bookmarks keep
// working: it forwards to the canonical public URL.
export default async function AdminListingRedirect({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const { id } = await params;
  const property = await fetchPropertyById(id);
  if (!property) notFound();
  permanentRedirect(getPropertyPath(property));
}
