import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth, clerkClient } from "@clerk/nextjs/server";

// Use service role to bypass RLS for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Tier {
  id: string;
  name: string;
  photo_limit: number;
  slot_limit: number;
  video_included: boolean;
  open_house_limit: number;
  has_badge: boolean;
  min_price: number;
  created_at: string;
}

interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ErrorItem {
  type: string;
  id: string;
  error: string;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is founder
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userType = user.publicMetadata?.userType;

    if (userType !== "founder") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is founder
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userType = user.publicMetadata?.userType;

    if (userType !== "founder") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { tiers, addons } = body;

    const results: {
      tiers: Tier[];
      addons: Addon[];
      errors: ErrorItem[];
    } = { tiers: [], addons: [], errors: [] };

    // Update tiers if provided
    if (tiers && Array.isArray(tiers)) {
      for (const tier of tiers) {
        const { id, min_price } = tier;

        if (!id || min_price === undefined) {
          results.errors.push({
            type: "tier",
            id,
            error: "Missing required fields",
          });
          continue;
        }

        const { data, error } = await supabaseAdmin
          .from("listing_tiers")
          .update({ min_price })
          .eq("id", id)
          .select()
          .single();

        if (error) {
          console.error(`Error updating tier ${id}:`, error);
          results.errors.push({ type: "tier", id, error: error.message });
        } else {
          results.tiers.push(data);
        }
      }
    }

    // Update add-ons if provided
    if (addons && Array.isArray(addons)) {
      for (const addon of addons) {
        const { id, price } = addon;

        if (!id || price === undefined) {
          results.errors.push({
            type: "addon",
            id,
            error: "Missing required fields",
          });
          continue;
        }

        const { data, error } = await supabaseAdmin
          .from("listing_addons")
          .update({ price, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();

        if (error) {
          console.error(`Error updating addon ${id}:`, error);
          results.errors.push({ type: "addon", id, error: error.message });
        } else {
          results.addons.push(data);
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
