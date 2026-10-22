import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllOnlineProperties } from "@/lib/data";
import { getPropertyPath } from "@/lib/property-url";
import { buildIndexCheckRow, indexHealth } from "@/lib/listing-index";
import {
  getSearchConsoleToken,
  inspectUrl,
  isSearchConsoleConfigured,
} from "@/lib/search-console";

// Vercel cron, daily at 05:00 UTC (vercel.json): asks Google Search Console
// whether each live listing is indexed and keeps the answer in
// listing_index_checks (098). Staff read it on /admin/annonces/google.
// Rows of listings that went offline are deleted, so the table only
// describes what is live.

export const maxDuration = 300;

const SITE = "https://www.roogobf.com";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSearchConsoleConfigured()) {
    return NextResponse.json({ skipped: "GSC_SERVICE_ACCOUNT_JSON not set" });
  }

  let token: string;
  try {
    token = await getSearchConsoleToken();
  } catch (error) {
    console.error("[listing-index-check] token failed", {
      message: (error as Error).message,
    });
    return NextResponse.json({ error: "token failed" }, { status: 502 });
  }

  const listings = await fetchAllOnlineProperties();
  const { data: previousRows, error: previousError } = await supabaseAdmin
    .from("listing_index_checks")
    .select("property_id, first_seen_at, first_indexed_at, verdict, coverage_state");
  if (previousError) {
    console.error("[listing-index-check] read failed", {
      code: previousError.code,
      message: previousError.message,
    });
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
  const previousById = new Map(
    (previousRows ?? []).map((row) => [row.property_id as string, row]),
  );

  const now = new Date().toISOString();
  const rows = [];
  // Sequential on purpose: 600 inspections per minute is the limit and a
  // few dozen listings take seconds.
  for (const listing of listings) {
    const url = `${SITE}${getPropertyPath(listing)}`;
    const inspected = await inspectUrl(token, url);
    if (!inspected.ok) {
      console.error("[listing-index-check] inspect failed", {
        propertyId: listing.id,
        status: inspected.status,
        error: inspected.error,
      });
    }
    rows.push(
      buildIndexCheckRow({
        propertyId: listing.id,
        url,
        previous: previousById.get(listing.id) ?? null,
        result: inspected.ok ? inspected.result : null,
        error: inspected.ok ? null : inspected.error,
        now,
      }),
    );
    if (!inspected.ok && inspected.status === 429) break;
  }

  if (rows.length) {
    const { error: upsertError } = await supabaseAdmin
      .from("listing_index_checks")
      .upsert(rows, { onConflict: "property_id" });
    if (upsertError) {
      console.error("[listing-index-check] upsert failed", {
        code: upsertError.code,
        message: upsertError.message,
      });
      return NextResponse.json({ error: "upsert failed" }, { status: 500 });
    }
  }

  const liveIds = new Set(listings.map((listing) => listing.id));
  const offlineIds = [...previousById.keys()].filter((id) => !liveIds.has(id));
  if (offlineIds.length) {
    const { error: deleteError } = await supabaseAdmin
      .from("listing_index_checks")
      .delete()
      .in("property_id", offlineIds);
    if (deleteError) {
      console.error("[listing-index-check] cleanup failed", {
        code: deleteError.code,
        message: deleteError.message,
      });
    }
  }

  const nowDate = new Date(now);
  const summary = { indexed: 0, waiting: 0, late: 0, errors: 0 };
  for (const row of rows) {
    if (row.last_error) summary.errors += 1;
    const health = indexHealth(row, nowDate);
    if (health !== "unchecked") summary[health] += 1;
  }
  console.log("[listing-index-check] done", { checked: rows.length, ...summary });
  return NextResponse.json({ checked: rows.length, ...summary });
}
