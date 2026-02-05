import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role to read early bird config (read-only, no auth required)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Fetch early bird config
    const { data: config, error } = await supabaseAdmin
      .from("early_bird_config")
      .select("id, rate, minimum_charge, duration_hours")
      .eq("id", "default")
      .single();

    if (error) {
      console.error("Error fetching early bird config:", error);
      // Return defaults if not found
      return NextResponse.json({
        config: {
          id: "default",
          rate: 0.1,
          minimum_charge: 10000,
          duration_hours: 48,
        },
      });
    }

    return NextResponse.json({ config });
  } catch (error) {
    console.error("API error:", error);
    // Return defaults on error
    return NextResponse.json({
      config: {
        id: "default",
        rate: 0.1,
        minimum_charge: 10000,
        duration_hours: 48,
      },
    });
  }
}
