import { NextResponse } from "next/server";
import { cors, corsOptions } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

type TrendingPropertyRow = {
  property_id: string;
  view_count: number;
  unique_viewers: number;
};

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const hoursWindow = Math.max(
    1,
    Math.min(Number(searchParams.get("hours") || 24), 24 * 30),
  );
  const resultLimit = Math.max(
    1,
    Math.min(Number(searchParams.get("limit") || 10), 50),
  );

  const { data, error } = await supabaseAdmin.rpc("get_trending_properties", {
    hours_window: hoursWindow,
    result_limit: resultLimit,
  });

  if (error) {
    console.error("Error fetching trending properties:", error);
    return cors(
      NextResponse.json(
        { error: "Failed to fetch trending properties" },
        { status: 500 },
      ),
      req,
    );
  }

  return cors(
    NextResponse.json({
      success: true,
      trending: (data || []) as TrendingPropertyRow[],
    }),
    req,
  );
}
