import { fetchAllOnlineProperties, type Property } from "./data";
import { checkListingQuality, type ListingQualityCheck } from "./listing-quality";
import {
  indexHealth,
  type IndexHealth,
  type ListingIndexRow,
} from "./listing-index";
import { getPropertyHeadline } from "./property-url";
import { supabaseAdmin } from "./supabase-admin";

// One row per live listing for /admin/annonces/google: the quality minimum
// and the latest Google indexing check. Service-role read; callers check
// the staff capability first.

export type ListingHealth = {
  id: string;
  reference: string | null;
  headline: string;
  path: string;
  quality: ListingQualityCheck[];
  index: ListingIndexRow | null;
  health: IndexHealth;
};

const HEALTH_ORDER: Record<IndexHealth, number> = {
  late: 0,
  unchecked: 1,
  waiting: 2,
  indexed: 3,
};

export async function getListingHealth(): Promise<{
  rows: ListingHealth[];
  lastCheckedAt: string | null;
}> {
  const [listings, checks] = await Promise.all([
    fetchAllOnlineProperties(),
    supabaseAdmin.from("listing_index_checks").select("*"),
  ]);
  if (checks.error) {
    // Table missing until 098 runs: show quality only.
    console.error("[listing-health] index checks read failed", {
      code: checks.error.code,
      message: checks.error.message,
    });
  }
  const byId = new Map(
    ((checks.data as ListingIndexRow[] | null) ?? []).map((row) => [
      row.property_id,
      row,
    ]),
  );
  const now = new Date();

  const rows = listings.map((listing: Property) => {
    const index = byId.get(listing.id) ?? null;
    return {
      id: listing.id,
      reference: listing.reference ?? null,
      headline: getPropertyHeadline(listing),
      path: `/proprietes/${listing.slug || listing.id}`,
      quality: checkListingQuality({
        description: listing.description,
        photoCount: listing.images.length,
      }),
      index,
      health: indexHealth(index, now),
    };
  });

  rows.sort((a, b) => {
    const byHealth = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
    if (byHealth) return byHealth;
    const aOk = a.quality.every((c) => c.ok) ? 1 : 0;
    const bOk = b.quality.every((c) => c.ok) ? 1 : 0;
    return aOk - bOk;
  });

  const lastCheckedAt = [...byId.values()].reduce<string | null>(
    (latest, row) => (!latest || row.checked_at > latest ? row.checked_at : latest),
    null,
  );
  return { rows, lastCheckedAt };
}
