// Google indexing state of live listings, from the daily Search Console
// check (/api/cron/listing-index-check, table listing_index_checks, 098).
// Pure (no imports) so the cron, the admin pages and node:test share it.

// A listing not indexed this many days after the check first saw it live
// is flagged to staff.
export const INDEX_ALERT_AFTER_DAYS = 7;

export type IndexStatusResult = {
  verdict?: string;
  coverageState?: string;
  lastCrawlTime?: string;
  googleCanonical?: string;
  referringUrls?: string[];
};

export type ListingIndexRow = {
  property_id: string;
  url: string;
  verdict: string;
  coverage_state: string | null;
  last_crawl_time: string | null;
  google_canonical: string | null;
  referring_urls: string[];
  first_seen_at: string;
  first_indexed_at: string | null;
  checked_at: string;
  last_error: string | null;
};

type PreviousRow = Pick<
  ListingIndexRow,
  "first_seen_at" | "first_indexed_at" | "verdict" | "coverage_state"
> | null;

// The row to upsert after one inspection. A failed call keeps the last known
// verdict and records the error, so a quota or auth problem never turns an
// indexed listing into "not indexed".
export function buildIndexCheckRow(input: {
  propertyId: string;
  url: string;
  previous: PreviousRow;
  result: IndexStatusResult | null;
  error: string | null;
  now: string;
}): ListingIndexRow {
  const { previous, result, now } = input;
  const firstSeenAt = previous?.first_seen_at || now;

  if (!result) {
    return {
      property_id: input.propertyId,
      url: input.url,
      verdict: previous?.verdict || "VERDICT_UNSPECIFIED",
      coverage_state: previous?.coverage_state ?? null,
      last_crawl_time: null,
      google_canonical: null,
      referring_urls: [],
      first_seen_at: firstSeenAt,
      first_indexed_at: previous?.first_indexed_at ?? null,
      checked_at: now,
      last_error: input.error || "Réponse vide de Search Console",
    };
  }

  const verdict = result.verdict || "VERDICT_UNSPECIFIED";
  return {
    property_id: input.propertyId,
    url: input.url,
    verdict,
    coverage_state: result.coverageState ?? null,
    last_crawl_time: result.lastCrawlTime ?? null,
    google_canonical: result.googleCanonical ?? null,
    referring_urls: result.referringUrls ?? [],
    first_seen_at: firstSeenAt,
    first_indexed_at:
      previous?.first_indexed_at ?? (verdict === "PASS" ? now : null),
    checked_at: now,
    last_error: null,
  };
}

export type IndexHealth = "indexed" | "waiting" | "late" | "unchecked";

export function indexHealth(
  row: Pick<ListingIndexRow, "verdict" | "first_seen_at"> | null,
  now: Date,
): IndexHealth {
  if (!row) return "unchecked";
  if (row.verdict === "PASS") return "indexed";
  const days = (now.getTime() - new Date(row.first_seen_at).getTime()) / 86_400_000;
  return days >= INDEX_ALERT_AFTER_DAYS ? "late" : "waiting";
}

export const INDEX_HEALTH_LABELS: Record<IndexHealth, string> = {
  indexed: "Sur Google",
  waiting: "En attente de Google",
  late: "Pas sur Google",
  unchecked: "Pas encore vérifié",
};

// Search Console's coverage states, in French for staff.
export function coverageStateLabel(state?: string | null): string {
  const labels: Record<string, string> = {
    "Submitted and indexed": "Indexée (via le sitemap)",
    "Indexed, not submitted in sitemap": "Indexée (hors sitemap)",
    "Discovered - currently not indexed": "Découverte, pas encore explorée",
    "Crawled - currently not indexed": "Explorée mais pas indexée",
    "URL is unknown to Google": "Inconnue de Google",
    "Duplicate, Google chose different canonical than user":
      "Doublon : Google a choisi une autre page",
    "Page with redirect": "Page redirigée",
    "Not found (404)": "Introuvable (404)",
  };
  if (!state) return "";
  return labels[state] || state;
}
