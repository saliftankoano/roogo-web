import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
    const { data, error } = await supabaseAdmin
      .from("ad_packages")
      .select(
        "id, platform, tier, name, price_xof, duration_days, rotation_weight",
      )
      .eq("active", true)
      .order("price_xof", { ascending: true });
    if (error) throw error;
    return cors(NextResponse.json({ success: true, packages: data ?? [] }), req);
  } catch (error) {
    console.error("GET /api/advertising/packages:", error);
    return errorResponse(
      safeError(error, "Failed to load advertising packages"),
      500,
      req,
    );
  }
}
