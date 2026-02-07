import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role to read pricing data (read-only, no auth required)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Fetch listing tiers
    const { data: tiers, error: tiersError } = await supabaseAdmin
      .from("listing_tiers")
      .select("*")
      .order("min_price", { ascending: true });

    if (tiersError) {
      console.error("Error fetching tiers:", tiersError);
      return NextResponse.json({ error: tiersError.message }, { status: 500 });
    }

    // Fetch add-ons
    const { data: addons, error: addonsError } = await supabaseAdmin
      .from("listing_addons")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (addonsError) {
      console.error("Error fetching addons:", addonsError);
      // Add-ons table might not exist yet, so we'll just return tiers
      return NextResponse.json({ tiers, addons: [] });
    }

    return NextResponse.json({ tiers, addons });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
