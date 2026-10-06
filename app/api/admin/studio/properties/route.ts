import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toPropertySummary, type PropertyRow } from "@/lib/studio/property-context";
import {
  PROPERTY_COLUMNS,
  propertyLabels,
} from "@/lib/studio/conversations-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Property picker for the Studio chat. Live listings by default, test
// listings never. Only fields the Studio is allowed to use are selected.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const url = new URL(req.url);
  // Strip characters that have meaning in a PostgREST filter expression.
  const q = (url.searchParams.get("q") ?? "")
    .replace(/[,()%*\\]/g, " ")
    .trim()
    .slice(0, 60);
  const includeAll = url.searchParams.get("all") === "1";

  let query = supabaseAdmin
    .from("property_details")
    .select(`${PROPERTY_COLUMNS}, created_at`)
    .eq("is_test", false)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!includeAll) query = query.eq("status", "en_ligne");
  if (q) {
    query = query.or(
      `quartier.ilike.%${q}%,address.ilike.%${q}%,property_type.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("Studio: property search failed", error.code);
    return errorResponse("Recherche impossible", 500, req);
  }

  const properties = ((data ?? []) as unknown as PropertyRow[]).map((row) =>
    toPropertySummary(row, propertyLabels),
  );
  return cors(NextResponse.json({ properties }), req);
}
